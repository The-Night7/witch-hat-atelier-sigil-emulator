const ELEMENT_WORDS = {
  fire: "fire",
  water: "water",
  wind: "wind",
  earth: "earth",
  light: "light"
};

const ELEMENT_VERBS = {
  fire: "channels fire energy",
  water: "channels water",
  wind: "channels the wind",
  earth: "shapes earth and stone",
  light: "bends light"
};

const MANIFESTATION_PHRASES = {
  column: "into a focused beam that shoots outward",
  dispersion: "outward in spreading waves across a wide area",
  levitation: "to lift and levitate its target off the ground",
  pull: "to pull and draw its target inward",
  crush: "to crush and compress what it contacts",
  float: "to gently suspend its target in mid-air",
  region: "to fill and affect a defined region of space",
  convergence: "converging to a precise focal point",
  collection: "gathering and accumulating material together",
  billow: "billowing outward in soft, expanding waves",
  repetition: "in repeating pulses, resetting its target",
  weave: "weaving material into flexible threads or ribbons",
  cool: "draining heat and cooling what it contacts",
  strengthen: "reinforcing and strengthening its target",
  "sights-set": "locking on and tracking a designated target",
  aura: "into an ambient aura that radiates around the seal"
};

export function generateSpellDescription(spellIR, selectedSigns) {
  if (!spellIR?.valid) return null;

  const element = spellIR.element ?? "magic";
  const primary = spellIR.primaryManifestation;
  const force = spellIR.force ?? 0;
  const focus = spellIR.focus ?? 0;
  const spread = spellIR.spread ?? 0;
  const range = spellIR.range ?? 0;
  const duration = spellIR.duration ?? 0;

  const signNames = selectedSigns.map((s) => s.displayName ?? s.id);
  const signPhrase =
    signNames.length === 0
      ? "with no signs"
      : signNames.length === 1
        ? `with the ${signNames[0]} sign`
        : `with the ${signNames.slice(0, -1).join(", ")} and ${signNames.at(-1)} signs`;

  const elementVerb = ELEMENT_VERBS[element] ?? `channels ${ELEMENT_WORDS[element] ?? element}`;
  const manifestPhrase = MANIFESTATION_PHRASES[primary] ?? "in an undefined form";

  const intensityWord = force > 0.72 ? "great" : force > 0.5 ? "moderate" : "light";
  const focusDesc =
    focus > 0.62
      ? "in a tightly concentrated form"
      : spread > 0.52
        ? "spread across a wide area"
        : "with balanced focus";
  const rangeWord = range > 0.62 ? "long" : range > 0.38 ? "medium" : "short";

  const durationText =
    duration > 6
      ? `sustaining itself for about ${Math.round(duration)} seconds`
      : duration > 2.5
        ? `lasting ${duration.toFixed(1)} seconds`
        : `flaring briefly for ${duration.toFixed(1)} seconds`;

  const secondaries = Object.entries(spellIR.manifestations ?? {})
    .filter(([id, m]) => id !== primary && (m?.strength ?? 0) > 0.1)
    .map(([id]) => id);
  const secondaryText =
    secondaries.length > 0
      ? ` The ${secondaries.join(" and ")} modifier${secondaries.length > 1 ? "s" : ""} ${secondaries.length > 1 ? "layer" : "layers"} additional effects onto the spell.`
      : "";

  return (
    `Sealing ${ELEMENT_WORDS[element] ?? element} ${signPhrase}, this composition ${elementVerb} ${manifestPhrase} ` +
    `with ${intensityWord} force, ${focusDesc}, effective at ${rangeWord} range, ${durationText}.${secondaryText}`
  );
}
