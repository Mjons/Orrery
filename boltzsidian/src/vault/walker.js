// Recursive walk of a FileSystemDirectoryHandle, yielding .md file entries.
// Skips dotfile directories (including .universe/) and node_modules/.

const SKIP_DIRS = new Set([".git", "node_modules"]);

export async function walkMarkdown(rootHandle) {
  const out = [];
  await walk(rootHandle, "", out);
  return out;
}

async function walk(dirHandle, prefix, out) {
  for await (const [name, handle] of dirHandle.entries()) {
    if (name.startsWith(".") || SKIP_DIRS.has(name)) continue;
    const path = prefix ? `${prefix}/${name}` : name;
    if (handle.kind === "file") {
      if (name.toLowerCase().endsWith(".md")) {
        out.push({ handle, path, name });
      }
    } else if (handle.kind === "directory") {
      await walk(handle, path, out);
    }
  }
}
