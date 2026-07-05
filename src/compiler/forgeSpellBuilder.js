import { compileSpell } from "./spellBuilder.js";

export function buildForgeSpellIR({ sigil, signs, dictionary, config }) {
  const syntheticSigns = signs.map((sign, i) => ({
    id: sign.id,
    kind: "sign",
    confidence: 1.0,
    neatness: 0.9,
    sizeNorm: 0.45,
    lengthNorm: 0.5,
    radiusNorm: 0.72,
    angleDeg: signs.length > 1 ? (i / signs.length) * 360 : 0,
    orientationDeg: 90,
    directedOrientationDeg: 90,
    layer: "outer",
    semantic: sign.semantic ?? {},
    shape: {
      axisDominance: 0.5,
      strokeLengthImbalance: 0.1,
      elongationNorm: 0.2
    }
  }));

  const glyphAST = {
    ring: {
      found: true,
      complete: false,
      completeness: 0.95,
      neatness: 0.9
    },
    primarySigil: {
      id: sigil.id,
      kind: "sigil",
      element: sigil.element,
      confidence: 1.0,
      neatness: 0.9,
      sizeNorm: 0.5,
      semantic: sigil.semantic ?? {},
      diagnostics: {
        topMatches: [{ kind: "sigil", id: sigil.id, confidence: 1.0 }]
      }
    },
    signs: syntheticSigns,
    unknowns: [],
    globalMetrics: {
      neatness: 0.9,
      radialSymmetry: 0.85,
      instability: 0.1
    },
    warnings: []
  };

  return {
    glyphAST,
    spellIR: compileSpell({ glyphAST, dictionary, config })
  };
}
