// RPG-Studio project files are isolated from game-specific assets.
export const GAME_ID = "pokemon";
export const EDITOR_BASE = `/storage/games/${GAME_ID}/editor/`;
export const EDITOR_PROJECT_URL = EDITOR_BASE + "data/RPGMapProject.json";

export function resolveEditorAssetPath(value) {
  if (typeof value !== "string" || !value) return value;
  if (/^(?:data:|blob:|https?:|\/\/)/i.test(value)) return value;

  const clean = value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
  const storageMatch = clean.match(/^(?:storage\/public\/|storage\/)?games\/[^/]+\/(?:editor\/)?assets\/(.+)$/i);
  if (storageMatch) return EDITOR_BASE + "assets/" + storageMatch[1];

  const editorMatch = clean.match(/^editor\/assets\/(.+)$/i);
  if (editorMatch) return EDITOR_BASE + "assets/" + editorMatch[1];

  const assetsMatch = clean.match(/^assets\/(.+)$/i);
  if (assetsMatch) return EDITOR_BASE + "assets/" + assetsMatch[1];

  // Keep game-specific battle/bag/icon paths unchanged.
  return value;
}

export function normalizeEditorProject(project) {
  const visited = new WeakSet();
  const visit = (node) => {
    if (!node || typeof node !== "object" || visited.has(node)) return;
    visited.add(node);
    if (Array.isArray(node)) { node.forEach(visit); return; }
    for (const [key, value] of Object.entries(node)) {
      if (typeof value === "string" &&
          ["imagePath", "spritePath", "file", "path"].includes(key)) {
        node[key] = resolveEditorAssetPath(value);
      } else if (value && typeof value === "object") visit(value);
    }
  };
  visit(project);
  return project;
}
