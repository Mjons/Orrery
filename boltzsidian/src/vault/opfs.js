// Origin Private File System — the sandboxed workspace that backs the demo
// vault. OPFS is always available on Chromium, doesn't need a permission
// prompt, and can't be seen in the user's Files app, so it's the right
// place to put a "try the app" universe that isn't pretending to be the
// user's real notes.
//
// The demo vault content is bundled at build time via Vite's import.meta.glob,
// so installing is a single async pass over a map of path → raw string.
// Multiple themes live side-by-side in src/demo-vault — `astronomer` is
// whatever sits at the root, `project` is everything under /project/. The
// theme param on installDemoVault filters to one tree.

const DEMO_FILES = import.meta.glob("../demo-vault/**/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
});

const DEMO_SENTINEL = ".demo-installed";

export const DEMO_THEMES = [
  {
    id: "astronomer",
    label: "Astronomer's notebook",
    blurb:
      "An amateur stargazer's working notebook — stars, constellations, observation logs.",
  },
  {
    id: "project",
    label: "Project planner",
    blurb:
      "A developer's notes planning Boltzsidian itself — vision, phases, decisions, risks.",
  },
];

export function isOpfsSupported() {
  return !!(navigator.storage && navigator.storage.getDirectory);
}

export async function getOpfsRoot() {
  if (!isOpfsSupported())
    throw new Error("OPFS is unavailable in this browser");
  return navigator.storage.getDirectory();
}

// Idempotent: fresh OPFS → full install; already installed → no-op. Callers
// force a full refresh via `{ overwrite: true }` (used by "Reset demo" and
// whenever the theme changes).
export async function installDemoVault(
  root,
  { overwrite = false, onProgress, theme = "astronomer" } = {},
) {
  const wantedTheme = theme === "project" ? "project" : "astronomer";
  const already = await readSentinel(root);
  const themeMatches = already && already.theme === wantedTheme;
  if (already && themeMatches && !overwrite)
    return { installed: false, files: 0, theme: wantedTheme };

  // Different theme (or forced): wipe OPFS clean so user edits to the prior
  // theme don't leak into the new one. The `.demo-installed` sentinel is
  // overwritten at the end regardless.
  await clearDirectory(root);

  const filtered = filterThemeFiles(DEMO_FILES, wantedTheme);
  let i = 0;
  for (const [relPath, content] of filtered) {
    await writeFileAt(root, relPath, content);
    i++;
    if (onProgress)
      onProgress({ done: i, total: filtered.length, file: relPath });
  }

  await writeFileAt(
    root,
    DEMO_SENTINEL,
    JSON.stringify(
      { installedAt: Date.now(), count: i, theme: wantedTheme },
      null,
      2,
    ),
  );
  return { installed: true, files: i, theme: wantedTheme };
}

export async function getInstalledDemoTheme(root) {
  const meta = await readSentinel(root);
  return meta?.theme || null;
}

async function readSentinel(root) {
  try {
    const fh = await root.getFileHandle(DEMO_SENTINEL);
    const f = await fh.getFile();
    const text = await f.text();
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function clearDirectory(dir) {
  const names = [];
  for await (const [name] of dir.entries()) names.push(name);
  for (const name of names) {
    try {
      await dir.removeEntry(name, { recursive: true });
    } catch (err) {
      console.warn("[bz] opfs clear failed for", name, err);
    }
  }
}

async function writeFileAt(root, relPath, content) {
  const parts = relPath.split("/");
  const name = parts.pop();
  let dir = root;
  for (const seg of parts) {
    if (!seg) continue;
    dir = await dir.getDirectoryHandle(seg, { create: true });
  }
  const file = await dir.getFileHandle(name, { create: true });
  const writable = await file.createWritable();
  await writable.write(content);
  await writable.close();
}

// Turn the glob's absolute-ish key into a vault-relative path filtered by
// theme. astronomer = everything NOT under /project/. project = things under
// /project/, with that prefix stripped.
function filterThemeFiles(files, theme) {
  const out = [];
  for (const [globPath, content] of Object.entries(files)) {
    const rel = pathBelowDemoVault(globPath);
    if (!rel) continue;
    if (theme === "project") {
      if (!rel.startsWith("project/")) continue;
      out.push([rel.slice("project/".length), content]);
    } else {
      // astronomer: everything else
      if (rel.startsWith("project/")) continue;
      out.push([rel, content]);
    }
  }
  return out;
}

function pathBelowDemoVault(globPath) {
  const marker = "/demo-vault/";
  const i = globPath.indexOf(marker);
  if (i === -1) return null;
  return globPath.slice(i + marker.length);
}
