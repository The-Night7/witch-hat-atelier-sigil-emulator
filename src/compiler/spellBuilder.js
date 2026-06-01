import { GLYPH_WARNINGS } from "../parser/glyphWarnings.js";
import { clamp } from "../utils/geometry.js";
import {
  aggregateManifestations,
  aggregateSemanticDeltas,
  combineSignDirection,
  signInfluence
} from "./semanticRules.js";
import { directionFromSurfaceVector } from "./spellDirection.js";
import { calculateSpellQuality, calculateSpellStability } from "./spellQuality.js";

const PRIMARY_SIGIL_AMBIGUITY_GAP = 0.05;

const SUPPORTED_ELEMENTS = new Set(["fire", "water", "wind", "earth", "light"]);

const ELEMENT_BLEND_TUNING = {
  confidencePower: 1.35,
  sizeBase: 0.55,
  sizeScale: 1.8,
  sizeMin: 0.45,
  sizeMax: 1.35,
  secondarySemanticScale: 0.72,
  minimumWeight: 0.01
};

const SPELL_PARAMETER_TUNING = {
  focusBase: 0.46,
  focusQuality: 0.2,
  spreadBase: 0.32,
  spreadInverseFocus: 0.28,
  forceBase: 0.34,
  forceSignPower: 0.34,
  forceQuality: 0.18,
  rangeBase: 0.42,
  rangeSignPower: 0.18,
  durationMinSeconds: 0.65,
  durationMaxSeconds: 8.5,
  durationSecondsScale: 6.4,
  durationQualityWeight: 0.35,
  durationNeatnessWeight: 0.65,
  durationCurve: 1.45
};

const PHYSICS_TUNING = {
  levitationGravityScale: 0.42
};

function sameKindAlternateConfidence(recognition) {
  return (
    recognition.diagnostics?.topMatches?.find((score) => score.kind === recognition.kind && score.id !== recognition.id)?.confidence ??
    0
  );
}

function invalidSpell(status, glyphAST, warnings = []) {
  const ringComplete = Boolean(glyphAST.ring?.complete);
  const combinedWarnings = [...new Set([...(glyphAST.warnings ?? []), ...warnings])];
  return {
    type: "SpellIR",
    active: false,
    prepared: false,
    valid: false,
    status,
    activatedAt: null,
    element: null,
    elements: [],
    elementBlend: [],
    elementConfidence: 0,
    primarySizeNorm: 0,
    effectScale: 1,
    primaryManifestation: "none",
    manifestations: {},
    direction: { x: 0, y: 0, z: 1, xTiltDeg: 0, yTiltDeg: 0, tiltFromZDeg: 0 },
    directionCoherence: 0,
    gravity: 1,
    force: 0,
    spread: 0,
    focus: 0,
    range: 0,
    duration: 0,
    stability: 0,
    quality: 0,
    neatness: glyphAST.globalMetrics?.neatness ?? 0,
    warnings: combinedWarnings,
    signature: `invalid:${status}:${ringComplete}:${glyphAST.ring?.completeness ?? 0}`
  };
}

function sigilInfluence(sigil) {
  const confidence = clamp(sigil.confidence ?? 0);
  const neatness = clamp(sigil.neatness ?? 0.6);
  const sizeWeight = clamp(
    ELEMENT_BLEND_TUNING.sizeBase + (sigil.sizeNorm ?? 0) * ELEMENT_BLEND_TUNING.sizeScale,
    ELEMENT_BLEND_TUNING.sizeMin,
    ELEMENT_BLEND_TUNING.sizeMax
  );
  return Math.pow(confidence, ELEMENT_BLEND_TUNING.confidencePower) * neatness * sizeWeight;
}

function sigilElementMissing(sigil) {
  return !sigil.element;
}

function sigilElementUnsupported(sigil) {
  return sigil.element && !SUPPORTED_ELEMENTS.has(sigil.element);
}

function blendedSigils(glyphAST) {
  return [glyphAST.primarySigil, ...(glyphAST.unsupportedMultipleSigils ?? [])].filter(Boolean);
}

function buildElementBlend(sigils) {
  const grouped = new Map();
  sigils.forEach((sigil, index) => {
    const influence = sigilInfluence(sigil);
    const group = grouped.get(sigil.element) ?? {
      element: sigil.element,
      influence: 0,
      confidence: 0,
      sizeNorm: 0,
      sigilIds: [],
      primary: false
    };
    group.influence += influence;
    group.confidence += (sigil.confidence ?? 0) * influence;
    group.sizeNorm += (sigil.sizeNorm ?? 0) * influence;
    group.sigilIds.push(sigil.id);
    group.primary ||= index === 0;
    grouped.set(sigil.element, group);
  });

  const totalInfluence = [...grouped.values()].reduce((sum, group) => sum + group.influence, 0);
  if (totalInfluence <= 0) {
    return [];
  }

  return [...grouped.values()]
    .map((group) => ({
      element: group.element,
      weight: clamp(group.influence / totalInfluence, ELEMENT_BLEND_TUNING.minimumWeight, 1),
      confidence: group.influence > 0 ? clamp(group.confidence / group.influence) : 0,
      sizeNorm: group.influence > 0 ? group.sizeNorm / group.influence : 0,
      sigilIds: group.sigilIds,
      primary: group.primary
    }))
    .sort((a, b) => b.weight - a.weight);
}

function blendedPrimarySemantic(sigils) {
  const [primary, ...secondary] = sigils;
  return secondary.reduce(
    (semantic, sigil) => {
      const influence = sigilInfluence(sigil) * ELEMENT_BLEND_TUNING.secondarySemanticScale;
      const sigilSemantic = sigil.semantic ?? {};
      return {
        force: semantic.force + (sigilSemantic.force ?? 0) * influence,
        focus: semantic.focus + (sigilSemantic.focus ?? 0) * influence,
        spread: semantic.spread + (sigilSemantic.spread ?? 0) * influence,
        range: semantic.range + (sigilSemantic.range ?? 0) * influence,
        lifetimeBias: semantic.lifetimeBias + (sigilSemantic.lifetimeBias ?? 0) * influence
      };
    },
    {
      force: primary.semantic?.force ?? 0,
      focus: primary.semantic?.focus ?? 0,
      spread: primary.semantic?.spread ?? 0,
      range: primary.semantic?.range ?? 0,
      lifetimeBias: primary.semantic?.lifetimeBias ?? 0
    }
  );
}

function blendedPrimarySize(primary, elementBlend) {
  if (!elementBlend.length) {
    return primary.sizeNorm ?? 0;
  }
  return elementBlend.reduce((sum, entry) => sum + entry.sizeNorm * entry.weight, 0);
}

function calculateSpellGravity(manifestationInfluence) {
  return clamp(1 - (manifestationInfluence.levitation ?? 0) * PHYSICS_TUNING.levitationGravityScale);
}

function manifestationSignature(manifestations) {
  return Object.entries(manifestations)
    .map(([id, manifestation]) => {
      const point = manifestation.point
        ? `.p${Math.round(manifestation.point.x * 100)}.${Math.round(manifestation.point.y * 100)}`
        : "";
      const radius = manifestation.radius === undefined ? "" : `.r${Math.round(manifestation.radius * 100)}`;
      return `${id}.${Math.round((manifestation.strength ?? 0) * 100)}${point}${radius}`;
    })
    .sort()
    .join(",");
}

function calculateSpellDuration({ primarySemantic, deltas, quality, neatness }) {
  const durationScore = clamp(
    quality * SPELL_PARAMETER_TUNING.durationQualityWeight +
      neatness * SPELL_PARAMETER_TUNING.durationNeatnessWeight +
      (primarySemantic.lifetimeBias ?? 0) +
      deltas.lifetimeBias
  );

  return clamp(
    SPELL_PARAMETER_TUNING.durationMinSeconds +
      Math.pow(durationScore, SPELL_PARAMETER_TUNING.durationCurve) * SPELL_PARAMETER_TUNING.durationSecondsScale,
    SPELL_PARAMETER_TUNING.durationMinSeconds,
    SPELL_PARAMETER_TUNING.durationMaxSeconds
  );
}

export function compileSpell({ glyphAST, config }) {
  if (!glyphAST?.ring?.found) {
    return invalidSpell("No ring detected", glyphAST ?? { globalMetrics: {} });
  }

  const primary = glyphAST.primarySigil;
  if (!primary) {
    return invalidSpell("Invalid spell", glyphAST, [GLYPH_WARNINGS.missingPrimarySigil]);
  }

  if (primary.confidence < config.compiler.minimumPrimarySigilConfidence) {
    return invalidSpell("Invalid spell", glyphAST, [GLYPH_WARNINGS.primarySigilConfidenceLow]);
  }

  const confidenceGap = primary.confidence - sameKindAlternateConfidence(primary);
  if (confidenceGap < PRIMARY_SIGIL_AMBIGUITY_GAP) {
    return invalidSpell("Ambiguous sigil", glyphAST, [GLYPH_WARNINGS.primarySigilAmbiguous]);
  }

  const sigils = blendedSigils(glyphAST);
  if (sigils.some(sigilElementMissing)) {
    return invalidSpell("Unsupported element", glyphAST, [GLYPH_WARNINGS.primaryElementMissing]);
  }

  if (sigils.some(sigilElementUnsupported)) {
    return invalidSpell("Unsupported element", glyphAST, [GLYPH_WARNINGS.primaryElementUnsupported]);
  }

  const elementBlend = buildElementBlend(sigils);
  const signs = glyphAST.signs ?? [];
  const quality = calculateSpellQuality(glyphAST);
  const stability = calculateSpellStability(glyphAST, config);
  const neatness = glyphAST.globalMetrics?.neatness ?? quality;
  const { primaryManifestation, manifestations, manifestationInfluence } = aggregateManifestations(signs);
  const deltas = aggregateSemanticDeltas(signs);
  const surfaceDirection = signs.length ? combineSignDirection(signs) : { x: 0, y: 0, strength: 0 };
  const directionCoherence = surfaceDirection.strength ?? 0;
  const signPower = signs.reduce((sum, sign) => sum + signInfluence(sign), 0);
  const active = Boolean(glyphAST.ring.complete);
  const prepared = !active;
  const primarySemantic = blendedPrimarySemantic(sigils);
  const primarySizeNorm = blendedPrimarySize(primary, elementBlend);
  const effectScale = clamp(
    config.renderer.effectSize.baseScale + primarySizeNorm * config.renderer.effectSize.sigilSizeInfluence,
    config.renderer.effectSize.minScale,
    config.renderer.effectSize.maxScale
  );

  const focus = clamp(
    SPELL_PARAMETER_TUNING.focusBase +
      (primarySemantic.focus ?? 0) +
      deltas.focus +
      quality * SPELL_PARAMETER_TUNING.focusQuality
  );
  const spread = clamp(
    SPELL_PARAMETER_TUNING.spreadBase +
      (primarySemantic.spread ?? 0) +
      deltas.spread +
      (1 - focus) * SPELL_PARAMETER_TUNING.spreadInverseFocus
  );

  const force = clamp(
    SPELL_PARAMETER_TUNING.forceBase +
      (primarySemantic.force ?? 0) +
      signPower * SPELL_PARAMETER_TUNING.forceSignPower +
      deltas.force +
      quality * SPELL_PARAMETER_TUNING.forceQuality
  );
  const range = clamp(
    SPELL_PARAMETER_TUNING.rangeBase +
      (primarySemantic.range ?? 0) +
      deltas.range +
      signPower * SPELL_PARAMETER_TUNING.rangeSignPower
  );
  const duration = calculateSpellDuration({ primarySemantic, deltas, quality, neatness });
  const direction = directionFromSurfaceVector(surfaceDirection, force);
  const gravity = calculateSpellGravity(manifestationInfluence);

  return {
    type: "SpellIR",
    active,
    prepared,
    valid: true,
    status: active ? "Active spell" : "Prepared spell",
    activatedAt: active ? performance.now() : null,
    element: primary.element,
    elements: elementBlend.map((entry) => entry.element),
    elementBlend,
    elementConfidence: primary.confidence,
    primarySizeNorm,
    effectScale,
    primaryManifestation,
    manifestations,
    direction,
    directionCoherence,
    gravity,
    force,
    spread,
    focus,
    range,
    duration,
    stability,
    quality,
    neatness,
    warnings: (glyphAST.warnings ?? []).filter((warning) => warning !== GLYPH_WARNINGS.unsupportedMultipleSigils),
    signature: `${elementBlend.map((entry) => `${entry.element}.${Math.round(entry.weight * 100)}`).join("+")}:${manifestationSignature(manifestations)}:${active}:${Math.round(effectScale * 100)}:${Math.round(
      force * 100
    )}:${Math.round(spread * 100)}:${Math.round(duration * 100)}:${Math.round(direction.xTiltDeg)}:${Math.round(
      direction.yTiltDeg
    )}:${Math.round(directionCoherence * 100)}:${Math.round(gravity * 100)}:${Math.round(
      quality * 100
    )}:${Math.round(stability * 100)}`
  };
}
