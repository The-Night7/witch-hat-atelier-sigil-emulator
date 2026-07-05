const REPO_OWNER = "The-Night7";
const REPO_NAME = "witch-hat-atelier-sigil-emulator";
const RECIPES_PATH = "src/dictionary/spell-recipes.json";
const API_BASE = "https://api.github.com";
const TOKEN_STORAGE_KEY = "forge_github_token";

export function persistToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

export function restoreToken() {
  return localStorage.getItem(TOKEN_STORAGE_KEY) ?? "";
}

// btoa-safe encoding for UTF-8 content
function encodeBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

async function githubRequest(token, path, options = {}) {
  const response = await fetch(`${API_BASE}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(options.headers ?? {})
    }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.message ?? `GitHub API returned ${response.status}`);
  }
  return data;
}

export async function saveSpellRecipe({ token, recipe }) {
  const fileData = await githubRequest(token, RECIPES_PATH);
  const existing = JSON.parse(atob(fileData.content.replace(/\n/g, "")));

  if (existing.some((r) => r.id === recipe.id)) {
    throw new Error(`A spell with id "${recipe.id}" already exists. Choose a different name.`);
  }

  existing.push(recipe);

  await githubRequest(token, RECIPES_PATH, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `forge: add custom spell "${recipe.displayName}"`,
      content: encodeBase64(JSON.stringify(existing, null, 2) + "\n"),
      sha: fileData.sha
    })
  });
}

export function makeSpellId(name) {
  return `custom-${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")}`;
}
