import { buildForgeSpellIR } from "../compiler/forgeSpellBuilder.js";
import { generateSpellDescription } from "../compiler/spellDescriptionGenerator.js";
import { saveSpellRecipe, makeSpellId, persistToken, restoreToken } from "./githubSaver.js";
import { clamp } from "../utils/geometry.js";

const MAX_SIGNS = 6;

function updateMeter(barEl, valEl, value) {
  const pct = `${Math.round(clamp(value ?? 0) * 100)}%`;
  barEl.style.width = pct;
  const level = value < 0.33 ? "low" : value < 0.67 ? "medium" : "high";
  barEl.dataset.level = level;
  valEl.textContent = pct;
}

function formatManifestations(spellIR) {
  const entries = Object.entries(spellIR?.manifestations ?? {}).filter(
    ([, m]) => (m?.strength ?? 0) > 0
  );
  if (!entries.length || spellIR?.primaryManifestation === "none") return "None";
  return entries.map(([id]) => id).join(", ");
}

function formatSpellName(spellIR) {
  const spell = spellIR?.recognizedSpell;
  if (!spell?.displayName) return "—";
  const prefix =
    spell.certainty === "ambiguous"
      ? "Ambiguous: "
      : spell.certainty === "family"
        ? "Likely "
        : spell.certainty === "partial"
          ? "Partial: "
          : "";
  const pct = typeof spell.confidence === "number" ? ` ${Math.round(spell.confidence * 100)}%` : "";
  return `${prefix}${spell.displayName}${pct}`;
}

function buildRecipe(name, notes, spellIR, sigil, signs) {
  const manifestations = [
    ...new Set(signs.filter((s) => s.semantic?.manifestation).map((s) => s.semantic.manifestation))
  ];
  const match = {};
  if (sigil?.element) match.elements = [sigil.element];
  if (manifestations.length) match.manifestations = manifestations;
  const signIds = signs.map((s) => s.id);
  if (signIds.length) match.signs = signIds;
  return {
    id: makeSpellId(name),
    displayName: name,
    category: "Custom",
    ...(notes ? { description: notes } : {}),
    match,
    custom: true,
    savedAt: new Date().toISOString()
  };
}

export function setupForge(elements, dictionary, config) {
  let selectedSigil = null;
  let selectedSigns = [];
  let lastSpellIR = null;

  const {
    forgeSigilSelect,
    forgeSignPicker,
    forgeSignList,
    forgeEvaluateButton,
    forgeResultPanel,
    forgeResultStatus,
    forgeResultSpell,
    forgeResultElement,
    forgeResultManifestation,
    forgeResultDuration,
    forgeForce,
    forgeForceValue,
    forgeFocus,
    forgeFocusValue,
    forgeSpread,
    forgeSpreadValue,
    forgeRange,
    forgeRangeValue,
    forgeDescription,
    forgeSavePanel,
    forgeSpellName,
    forgeSpellNotes,
    forgeGithubToken,
    forgeSaveButton,
    forgeSaveStatus
  } = elements;

  // Populate sigil selector
  (dictionary.sigils ?? []).forEach((sigil) => {
    const opt = document.createElement("option");
    opt.value = sigil.id;
    opt.textContent = sigil.displayName ?? sigil.id;
    forgeSigilSelect.appendChild(opt);
  });

  // Populate sign picker
  (dictionary.signs ?? []).forEach((sign) => {
    const opt = document.createElement("option");
    opt.value = sign.id;
    opt.textContent = sign.displayName ?? sign.id;
    forgeSignPicker.appendChild(opt);
  });

  // Restore saved token
  forgeGithubToken.value = restoreToken();

  forgeSigilSelect.addEventListener("change", () => {
    selectedSigil = (dictionary.sigils ?? []).find((s) => s.id === forgeSigilSelect.value) ?? null;
  });

  forgeSignPicker.addEventListener("change", () => {
    const id = forgeSignPicker.value;
    forgeSignPicker.value = "";
    if (!id || selectedSigns.length >= MAX_SIGNS) return;
    const sign = (dictionary.signs ?? []).find((s) => s.id === id);
    if (sign) {
      selectedSigns.push(sign);
      renderSignTags();
    }
  });

  function renderSignTags() {
    forgeSignList.innerHTML = "";
    selectedSigns.forEach((sign, idx) => {
      const tag = document.createElement("div");
      tag.className = "forge-sign-tag";

      const label = document.createElement("span");
      label.textContent = sign.displayName ?? sign.id;

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "forge-sign-remove";
      removeBtn.setAttribute("aria-label", `Remove ${sign.displayName ?? sign.id}`);
      removeBtn.textContent = "×";
      removeBtn.addEventListener("click", () => {
        selectedSigns.splice(idx, 1);
        renderSignTags();
      });

      tag.appendChild(label);
      tag.appendChild(removeBtn);
      forgeSignList.appendChild(tag);
    });
  }

  function showResult(spellIR) {
    lastSpellIR = spellIR;
    forgeResultPanel.hidden = false;

    const isKnown = Boolean(spellIR?.recognizedSpell?.displayName);
    const statusText = isKnown
      ? `Known spell: ${formatSpellName(spellIR)}`
      : spellIR?.valid
        ? "Custom composition"
        : "Invalid composition";
    const statusClass = isKnown ? "prepared" : spellIR?.valid ? "" : "invalid";

    forgeResultStatus.textContent = statusText;
    forgeResultStatus.className = `spell-state-status ${statusClass}`.trim();

    forgeResultSpell.textContent = formatSpellName(spellIR);
    forgeResultElement.textContent = spellIR?.element ?? "—";
    forgeResultManifestation.textContent = formatManifestations(spellIR);
    const dur = spellIR?.duration ?? 0;
    forgeResultDuration.textContent = dur > 0 ? `${dur.toFixed(1)} s` : "—";

    updateMeter(forgeForce, forgeForceValue, spellIR?.force ?? 0);
    updateMeter(forgeFocus, forgeFocusValue, spellIR?.focus ?? 0);
    updateMeter(forgeSpread, forgeSpreadValue, spellIR?.spread ?? 0);
    updateMeter(forgeRange, forgeRangeValue, spellIR?.range ?? 0);

    const description = spellIR?.valid ? generateSpellDescription(spellIR, selectedSigns) : null;
    forgeDescription.textContent = description ?? "";
    forgeDescription.hidden = !description;

    forgeSavePanel.hidden = !spellIR?.valid;
    if (spellIR?.valid) {
      forgeSaveStatus.textContent = "";
      forgeSaveStatus.className = "forge-save-status";
    }
  }

  forgeEvaluateButton.addEventListener("click", () => {
    if (!selectedSigil) {
      forgeResultPanel.hidden = false;
      forgeSavePanel.hidden = true;
      forgeResultStatus.textContent = "Choose a sigil first";
      forgeResultStatus.className = "spell-state-status invalid";
      forgeResultSpell.textContent = "—";
      forgeResultElement.textContent = "—";
      forgeResultManifestation.textContent = "—";
      forgeResultDuration.textContent = "—";
      forgeDescription.hidden = true;
      return;
    }
    const { spellIR } = buildForgeSpellIR({ sigil: selectedSigil, signs: selectedSigns, dictionary, config });
    showResult(spellIR);
  });

  forgeSaveButton.addEventListener("click", async () => {
    const name = forgeSpellName.value.trim();
    if (!name) {
      forgeSaveStatus.textContent = "Enter a name for this spell.";
      forgeSaveStatus.className = "forge-save-status error";
      return;
    }
    const token = forgeGithubToken.value.trim();
    if (!token) {
      forgeSaveStatus.textContent = "Enter your GitHub Personal Access Token.";
      forgeSaveStatus.className = "forge-save-status error";
      return;
    }

    persistToken(token);
    forgeSaveButton.disabled = true;
    forgeSaveStatus.textContent = "Saving…";
    forgeSaveStatus.className = "forge-save-status";

    try {
      const recipe = buildRecipe(name, forgeSpellNotes.value.trim(), lastSpellIR, selectedSigil, selectedSigns);
      await saveSpellRecipe({ token, recipe });
      forgeSaveStatus.textContent = `"${name}" saved to the repository.`;
      forgeSaveStatus.className = "forge-save-status success";
    } catch (err) {
      forgeSaveStatus.textContent = `Error: ${err.message}`;
      forgeSaveStatus.className = "forge-save-status error";
    } finally {
      forgeSaveButton.disabled = false;
    }
  });
}
