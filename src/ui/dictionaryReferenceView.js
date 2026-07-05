function formatSemanticValue(val) {
  const pct = Math.round((val ?? 0) * 100);
  return pct >= 0 ? `+${pct}%` : `${pct}%`;
}

function renderSignSemanticRows(semantic) {
  if (!semantic) return "";
  const rows = [
    semantic.manifestation ? `<div><dt>Manifestation</dt><dd>${escapeHtml(semantic.manifestation)}</dd></div>` : "",
    semantic.force !== undefined ? `<div><dt>Force</dt><dd>${formatSemanticValue(semantic.force)}</dd></div>` : "",
    semantic.focus !== undefined ? `<div><dt>Focus</dt><dd>${formatSemanticValue(semantic.focus)}</dd></div>` : "",
    semantic.spread !== undefined ? `<div><dt>Spread</dt><dd>${formatSemanticValue(semantic.spread)}</dd></div>` : "",
    semantic.range !== undefined ? `<div><dt>Range</dt><dd>${formatSemanticValue(semantic.range)}</dd></div>` : ""
  ].filter(Boolean);
  return rows.join("");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function getStrokeTemplate(entry) {
  return entry.strokeTemplate ?? null;
}

function entryRecognitionLabel(entry) {
  return getStrokeTemplate(entry)?.strokes?.length ? "stroke reference" : "not configured";
}

function renderStrokePreview(strokes) {
  if (!strokes?.length) {
    return "";
  }

  const polylines = strokes
    .map((stroke) => {
      const points = stroke
        .map((point) => {
          const x = Number(point.x);
          const y = Number(point.y);
          if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return null;
          }
          const previewX = 8 + x * 84;
          const previewY = 8 + y * 84;
          return `${Math.round(previewX * 10) / 10},${Math.round(previewY * 10) / 10}`;
        })
        .filter(Boolean)
        .join(" ");

      return points ? `<polyline points="${points}"></polyline>` : "";
    })
    .join("");

  return `
    <div class="reference-preview" aria-hidden="true">
      <svg viewBox="0 0 100 100" role="img" focusable="false">
        ${polylines}
      </svg>
    </div>
  `;
}

function renderStrokeTemplatePreview(entry) {
  return renderStrokePreview(getStrokeTemplate(entry)?.strokes);
}

function renderReferenceCard(entry, kind) {
  const layerText = entry.allowedLayers?.join(", ") || "any";
  const elementText = kind === "sigil" && entry.element ? entry.element : "";
  const elementBadge = elementText ? `<span>${escapeHtml(elementText)}</span>` : "";
  const hasStrokeReference = Boolean(getStrokeTemplate(entry)?.strokes?.length);
  const semanticRows = kind === "sign" ? renderSignSemanticRows(entry.semantic) : "";
  const sourceDetails =
    kind === "sign" && entry.sourceNotes
      ? `
        <details class="reference-source">
          <summary>Source notes</summary>
          <p>${escapeHtml(entry.sourceNotes)}</p>
        </details>
      `
      : "";
  return `
    <article class="reference-card reference-card-${kind} ${hasStrokeReference ? "has-template" : ""}">
      ${renderStrokeTemplatePreview(entry)}
      <div>
        <div class="reference-card-header">
          <strong>${escapeHtml(entry.displayName ?? entry.id)}</strong>
          ${elementBadge}
        </div>
        <dl>
          <div><dt>Layers</dt><dd>${escapeHtml(layerText)}</dd></div>
          ${semanticRows}
          <div><dt>Recognition</dt><dd>${escapeHtml(entryRecognitionLabel(entry))}</dd></div>
        </dl>
        ${sourceDetails}
      </div>
    </article>
  `;
}

function renderSampleSpellCard(sample, showLoad) {
  const manifestations = sample.manifestations?.length ? sample.manifestations.join(", ") : "none";
  const hasStrokeReference = Boolean(sample.strokes?.length);
  const loadButton = showLoad
    ? `<button type="button" class="load-spell-button" data-sample-id="${escapeHtml(sample.id)}">Load on canvas</button>`
    : "";
  return `
    <article class="reference-card ${hasStrokeReference ? "has-template" : ""}">
      ${renderStrokePreview(sample.strokes)}
      <div>
        <div class="reference-card-header">
          <strong>${escapeHtml(sample.displayName ?? sample.id)}</strong>
          ${sample.element ? `<span>${escapeHtml(sample.element)}</span>` : ""}
        </div>
        <p class="reference-card-description">${escapeHtml(sample.description)}</p>
        <dl>
          <div><dt>Element</dt><dd>${escapeHtml(sample.element ?? "none")}</dd></div>
          <div><dt>Manifestations</dt><dd>${escapeHtml(manifestations)}</dd></div>
        </dl>
        ${loadButton}
      </div>
    </article>
  `;
}

function renderPrincipleCard(principle) {
  return `
    <article class="reference-card">
      <div class="reference-card-header">
        <strong>${escapeHtml(principle.displayName ?? principle.id)}</strong>
        <span>rule</span>
      </div>
      <p class="reference-card-description">${escapeHtml(principle.summary)}</p>
    </article>
  `;
}

function renderSpellFamilyCard(family) {
  const spellNames = family.spellNames?.length ? family.spellNames.join(", ") : "none listed";
  return `
    <article class="reference-card">
      <div class="reference-card-header">
        <strong>${escapeHtml(family.displayName ?? family.id)}</strong>
        <span>${escapeHtml(family.element ?? family.kind ?? "lore")}</span>
      </div>
      <p class="reference-card-description">${escapeHtml(family.summary)}</p>
      <dl>
        <div><dt>Type</dt><dd>${escapeHtml(family.kind ?? "lore")}</dd></div>
        <div><dt>Examples</dt><dd>${escapeHtml(spellNames)}</dd></div>
      </dl>
    </article>
  `;
}

function renderSpellRecipeCard(recipe) {
  const match = recipe.match ?? {};
  const parts = [
    ...(match.elements ?? []).map((value) => `element:${value}`),
    ...(match.sigils ?? []).map((value) => `sigil:${value}`),
    ...(match.signs ?? []).map((value) => `sign:${value}`),
    ...(match.manifestations ?? []).map((value) => `form:${value}`)
  ];
  const matchText = parts.length ? parts.join(", ") : "family fallback";
  const badge = recipe.safety === "forbidden" ? "forbidden" : recipe.category ?? "spell";
  return `
    <article class="reference-card">
      <div class="reference-card-header">
        <strong>${escapeHtml(recipe.displayName ?? recipe.id)}</strong>
        <span>${escapeHtml(badge)}</span>
      </div>
      <dl>
        <div><dt>Category</dt><dd>${escapeHtml(recipe.category ?? "unknown")}</dd></div>
        <div><dt>Match</dt><dd>${escapeHtml(matchText)}</dd></div>
      </dl>
    </article>
  `;
}

function renderLoreReference(spellLore, spellRecipes = []) {
  if (!spellLore) {
    return "";
  }

  const sourceLinks = (spellLore.sources ?? [])
    .map((source) => `<a href="${escapeHtml(source.url)}" target="_blank" rel="noreferrer">${escapeHtml(source.title)}</a>`)
    .join(", ");
  const sourceCard = sourceLinks
    ? `
      <article class="reference-card">
        <div class="reference-card-header">
          <strong>Wiki Sources</strong>
          <span>reference</span>
        </div>
        <p class="reference-card-description">${sourceLinks}</p>
      </article>
    `
    : "";

  return [
    sourceCard,
    ...(spellLore.principles ?? []).map(renderPrincipleCard),
    ...(spellLore.families ?? []).map(renderSpellFamilyCard),
    ...(spellRecipes ?? []).filter((recipe) => recipe.kind !== "family").map(renderSpellRecipeCard)
  ].join("");
}

export function renderDictionaryReference(elements, dictionary, { onLoadSample } = {}) {
  if (!dictionary) {
    return;
  }

  elements.sampleSpellReferenceCards.innerHTML = (dictionary.sampleSpells ?? [])
    .map((sample) => renderSampleSpellCard(sample, Boolean(onLoadSample)))
    .join("");

  if (onLoadSample) {
    elements.sampleSpellReferenceCards.querySelectorAll(".load-spell-button").forEach((btn) => {
      const id = btn.dataset.sampleId;
      btn.addEventListener("click", () => {
        const sample = (dictionary.sampleSpells ?? []).find((s) => s.id === id);
        if (sample) onLoadSample(sample);
      });
    });
  }
  elements.sigilReferenceCards.innerHTML = (dictionary.sigils ?? [])
    .map((entry) => renderReferenceCard(entry, "sigil"))
    .join("");
  elements.signReferenceCards.innerHTML = (dictionary.signs ?? [])
    .map((entry) => renderReferenceCard(entry, "sign"))
    .join("");
  elements.loreReferenceCards.innerHTML = renderLoreReference(dictionary.spellLore, dictionary.spellRecipes);
}
