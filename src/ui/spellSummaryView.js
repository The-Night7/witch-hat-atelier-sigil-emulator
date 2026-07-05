import { GLYPH_WARNINGS } from "../parser/glyphWarnings.js";
import { clamp } from "../utils/geometry.js";

function updateMeter(element, valueElement, value) {
  const normalized = clamp(value ?? 0);
  const percent = `${Math.round(normalized * 100)}%`;
  element.style.width = percent;
  element.dataset.level = normalized < 0.33 ? "low" : normalized < 0.67 ? "medium" : "high";
  valueElement.textContent = percent;
}

export function updateStatus(elements, status, className) {
  elements.statusValue.textContent = status;
  elements.statusValue.className = `spell-state-status ${className ?? ""}`.trim();
}

function spellStatusClass(spellIR, closedWithoutSpell, hasUnsupportedStructure) {
  if (hasUnsupportedStructure) {
    return "invalid";
  }
  if (spellIR?.active) {
    return "active";
  }
  if (spellIR?.prepared) {
    return "prepared";
  }
  if (closedWithoutSpell && spellIR?.warnings?.includes(GLYPH_WARNINGS.missingPrimarySigil)) {
    return "closed";
  }
  return spellIR?.valid ? "" : "invalid";
}

function closedWithoutSpellStatus(spellIR) {
  const warnings = spellIR?.warnings ?? [];
  if (warnings.includes(GLYPH_WARNINGS.unsupportedMultipleRings)) {
    return "Multiple rings detected - undo or clear";
  }
  if (
    warnings.includes(GLYPH_WARNINGS.primaryElementMissing) ||
    warnings.includes(GLYPH_WARNINGS.primaryElementUnsupported)
  ) {
    return "Ring closed - unsupported element";
  }
  if (warnings.includes(GLYPH_WARNINGS.symbolContaminated)) {
    return "Ring closed - contaminated sigil";
  }
  if (warnings.includes(GLYPH_WARNINGS.symbolAmbiguous)) {
    return "Ring closed - ambiguous sigil";
  }
  if (warnings.includes(GLYPH_WARNINGS.primarySigilAmbiguous)) {
    return "Ring closed - ambiguous sigil";
  }
  if (warnings.includes(GLYPH_WARNINGS.primarySigilConfidenceLow)) {
    return "Ring closed - unstable sigil";
  }
  return "Ring closed - no stable magic detected";
}

function formatManifestations(spellIR) {
  const manifestations = Object.entries(spellIR?.manifestations ?? {}).filter(
    ([, manifestation]) => (manifestation?.strength ?? 0) > 0
  );
  if (!manifestations.length || spellIR?.primaryManifestation === "none") {
    return "None";
  }

  return manifestations.map(([id]) => id).join(", ");
}

function formatElements(spellIR) {
  const blend = spellIR?.elementBlend ?? [];
  if (blend.length > 1) {
    return blend.map((entry) => `${entry.element} ${Math.round(entry.weight * 100)}%`).join(" + ");
  }
  return spellIR?.element ? spellIR.element : "None";
}

function formatRecognizedSpell(spellIR) {
  const spell = spellIR?.recognizedSpell;
  if (!spell?.displayName) {
    return "None";
  }

  const confidence = typeof spell.confidence === "number" ? ` ${Math.round(spell.confidence * 100)}%` : "";
  const prefix =
    spell.certainty === "ambiguous"
      ? "Ambiguous: "
      : spell.certainty === "family"
        ? "Likely "
        : spell.certainty === "partial"
          ? "Partial: "
          : "";
  const suffix = spell.safety === "forbidden" ? " (forbidden)" : "";
  return `${prefix}${spell.displayName}${suffix}${confidence}`;
}

export function updateSummary({ elements, store, capture, pipeline, spellIR }) {
  const ringClosed = Boolean(pipeline?.ring?.complete);
  const hasUnsupportedMultipleRings = Boolean(pipeline?.ring?.unsupportedMultipleRings?.length);
  const hasUnsupportedStructure = hasUnsupportedMultipleRings;
  const closedWithoutSpell = ringClosed && !spellIR?.active;
  const status = hasUnsupportedMultipleRings
    ? "Multiple rings detected - undo or clear"
    : closedWithoutSpell
      ? closedWithoutSpellStatus(spellIR)
      : spellIR?.status ?? "No ring detected";
  updateStatus(elements, status, spellStatusClass(spellIR, closedWithoutSpell, hasUnsupportedStructure));

  const inputLocked = ringClosed || hasUnsupportedStructure;
  const undoLocked = ringClosed;
  elements.undoButton.disabled = undoLocked || store.count() === 0;
  elements.glyphCanvas.classList.toggle("locked", inputLocked);
  elements.canvasShell.classList.toggle("portal-active", Boolean(spellIR?.active)); // tilting the paper angle
  elements.canvasHint.classList.toggle("hidden", store.count() > 0 || !elements.guidesToggle.checked);

  if (capture) {
    capture.setLocked(inputLocked);
  }

  elements.spellNameValue.textContent = formatRecognizedSpell(spellIR);
  elements.elementValue.textContent = formatElements(spellIR);
  elements.manifestationValue.textContent = formatManifestations(spellIR);
  const duration = spellIR?.duration ?? 0;
  elements.durationValue.textContent = duration > 0 ? `${duration.toFixed(1)} s` : "—";
  updateMeter(elements.qualityMeter, elements.qualityMeterValue, spellIR?.quality ?? 0);
  updateMeter(elements.stabilityMeter, elements.stabilityMeterValue, spellIR?.stability ?? 0);
  updateMeter(elements.forceMeter, elements.forceMeterValue, spellIR?.force ?? 0);
  updateMeter(elements.focusMeter, elements.focusMeterValue, spellIR?.focus ?? 0);
  updateMeter(elements.spreadMeter, elements.spreadMeterValue, spellIR?.spread ?? 0);
  updateMeter(elements.rangeMeter, elements.rangeMeterValue, spellIR?.range ?? 0);
}
