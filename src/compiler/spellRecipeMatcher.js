import { clamp } from "../utils/geometry.js";

const SCORE_TUNING = {
  element: 0.34,
  sigil: 0.22,
  manifestation: 0.28,
  sign: 0.16,
  missingRequiredPenalty: 0.18,
  ambiguityGap: 0.06,
  minimumNamedConfidence: 0.42
};

function recognizedSigils(glyphAST) {
  return [glyphAST?.primarySigil, ...(glyphAST?.unsupportedMultipleSigils ?? [])].filter(Boolean);
}

function recognizedSigns(glyphAST) {
  return glyphAST?.signs ?? [];
}

function idSet(items) {
  return new Set(items.filter(Boolean));
}

function elementSet(spellIR, sigils) {
  return idSet([spellIR?.element, ...(spellIR?.elements ?? []), ...sigils.map((sigil) => sigil.element)]);
}

function weightedSetScore(required, present, optional = []) {
  if (!required?.length && !optional?.length) {
    return 1;
  }

  const requiredMatches = required?.filter((id) => present.has(id)).length ?? 0;
  const optionalMatches = optional?.filter((id) => present.has(id)).length ?? 0;
  const requiredScore = required?.length ? requiredMatches / required.length : 1;
  const optionalScore = optional?.length ? optionalMatches / optional.length : 0;
  return clamp(requiredScore * 0.82 + optionalScore * 0.18);
}

function hasAll(required, present) {
  return (required ?? []).every((id) => present.has(id));
}

function recipeScore(recipe, spellIR, glyphAST) {
  const sigils = recognizedSigils(glyphAST);
  const signs = recognizedSigns(glyphAST);
  const elements = elementSet(spellIR, sigils);
  const sigilIds = idSet(sigils.map((sigil) => sigil.id));
  const signIds = idSet(signs.map((sign) => sign.id));
  const manifestations = idSet(Object.keys(spellIR?.manifestations ?? {}));
  const match = recipe.match ?? {};

  const elementRequired = match.elements ?? [];
  const sigilRequired = match.sigils ?? [];
  const manifestationRequired = match.manifestations ?? [];
  const signRequired = match.signs ?? [];
  const missingRequired =
    (hasAll(elementRequired, elements) ? 0 : 1) +
    (hasAll(sigilRequired, sigilIds) ? 0 : 1) +
    (hasAll(manifestationRequired, manifestations) ? 0 : 1) +
    (hasAll(signRequired, signIds) ? 0 : 1);

  const elementScore = weightedSetScore(elementRequired, elements, match.optionalElements);
  const sigilScore = weightedSetScore(sigilRequired, sigilIds, match.optionalSigils);
  const manifestationScore = weightedSetScore(manifestationRequired, manifestations, match.optionalManifestations);
  const signScore = weightedSetScore(signRequired, signIds, match.optionalSigns);

  const specificity =
    elementRequired.length +
    sigilRequired.length * 1.2 +
    manifestationRequired.length +
    signRequired.length * 1.2 +
    (match.optionalSigns?.length ?? 0) * 0.2;

  const weighted =
    elementScore * SCORE_TUNING.element +
    sigilScore * SCORE_TUNING.sigil +
    manifestationScore * SCORE_TUNING.manifestation +
    signScore * SCORE_TUNING.sign;
  const confidence = clamp(
    weighted + Math.min(0.12, specificity * 0.012) - missingRequired * SCORE_TUNING.missingRequiredPenalty
  );

  return {
    recipe,
    confidence,
    missingRequired,
    specificity
  };
}

function categoryFallback(spellIR, recipes) {
  if (!spellIR?.valid || !spellIR.element) {
    return null;
  }

  const recipe = recipes.find((entry) => entry.kind === "family" && entry.match?.elements?.includes(spellIR.element));
  if (!recipe) {
    return null;
  }

  return {
    id: recipe.id,
    displayName: recipe.displayName,
    category: recipe.category,
    confidence: clamp((spellIR.elementConfidence ?? 0) * 0.72),
    certainty: "family",
    safety: recipe.safety ?? "normal",
    sourceUrl: recipe.sourceUrl
  };
}

export function recognizeSpellRecipe({ spellIR, glyphAST, recipes = [] }) {
  if (!spellIR?.valid || !recipes.length) {
    return null;
  }

  const scored = recipes
    .filter((recipe) => recipe.kind !== "family")
    .map((recipe) => recipeScore(recipe, spellIR, glyphAST))
    .filter((entry) => entry.confidence > 0)
    .sort((a, b) => b.confidence - a.confidence || b.specificity - a.specificity);

  const [best, next] = scored;
  if (!best || best.confidence < SCORE_TUNING.minimumNamedConfidence) {
    return categoryFallback(spellIR, recipes);
  }

  const gap = best.confidence - (next?.confidence ?? 0);
  const certain = gap >= SCORE_TUNING.ambiguityGap || best.confidence > 0.88;
  if (!certain) {
    return {
      id: "ambiguous-spell",
      displayName: `${best.recipe.displayName} / ${next.recipe.displayName}`,
      category: best.recipe.category,
      confidence: clamp(best.confidence),
      certainty: "ambiguous",
      safety: best.recipe.safety ?? "normal",
      alternatives: scored.slice(0, 3).map((entry) => ({
        id: entry.recipe.id,
        displayName: entry.recipe.displayName,
        confidence: clamp(entry.confidence)
      }))
    };
  }

  return {
    id: best.recipe.id,
    displayName: best.recipe.displayName,
    category: best.recipe.category,
    confidence: clamp(best.confidence),
    certainty: best.missingRequired ? "partial" : "matched",
    safety: best.recipe.safety ?? "normal",
    sourceUrl: best.recipe.sourceUrl,
    alternatives: scored.slice(1, 4).map((entry) => ({
      id: entry.recipe.id,
      displayName: entry.recipe.displayName,
      confidence: clamp(entry.confidence)
    }))
  };
}
