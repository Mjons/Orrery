// Vault mutations. The vault model built by openVault() is the single source
// of truth during a session; these helpers keep it consistent when notes are
// created, re-parsed after save, or have their titles change.

import { ulid } from "ulid";
import { parseMarkdown } from "./parser.js";
import { computeKind } from "./kind.js";
import { stringifyFrontmatter } from "./frontmatter.js";

const WIKI_ALL_RE = /\[\[([^\]\|\n]+?)(\|[^\]\n]+)?\]\]/g;

// Create an empty in-memory note. The file is NOT created here — the first
// autosave writes it out (so cancelled Cmd+N never leaves an empty file).
export function makeEmptyNote({
  path,
  title = "Untitled",
  settings,
  rootId = null,
}) {
  const id = ulid();
  const now = Date.now();
  const note = {
    id,
    path,
    name: path.split("/").pop(),
    title,
    body: "",
    rawText: "",
    frontmatter: { id, created: new Date(now).toISOString() },
    tags: [],
    links: [],
    words: 0,
    mtime: now,
    size: 0,
    kind: 0,
    rootId,
    _isPhantom: true,
  };
  note.kind = computeKind(note, settings);
  return note;
}

export function addNoteToVault(vault, note) {
  vault.notes.push(note);
  vault.byId.set(note.id, note);
  // Phase 2: byTitle is Map<title, Note[]>. Append to the bucket for
  // this title — create a new bucket if none exists yet.
  addToTitleBucket(vault.byTitle, note);
  vault.forward.set(note.id, new Set());
  vault.backward.set(note.id, new Set());
  vault.stats.notes = vault.notes.length;
}

function addToTitleBucket(byTitle, note) {
  const key = String(note.title || "")
    .toLowerCase()
    .trim();
  if (!key) return;
  let bucket = byTitle.get(key);
  if (!bucket) {
    bucket = [];
    byTitle.set(key, bucket);
  }
  if (!bucket.includes(note)) bucket.push(note);
}

function removeFromTitleBucket(byTitle, note, titleKeyOverride = null) {
  const key =
    titleKeyOverride ??
    String(note.title || "")
      .toLowerCase()
      .trim();
  if (!key) return;
  const bucket = byTitle.get(key);
  if (!bucket) return;
  const i = bucket.indexOf(note);
  if (i !== -1) bucket.splice(i, 1);
  if (bucket.length === 0) byTitle.delete(key);
}

// Detach a note from the vault's indices. Used by the Weed drawer after
// an archive or delete — the file is gone from disk, so the in-memory
// model must follow. Any incoming backlinks become dangling wikilinks in
// their source notes (exactly what happens after any external file
// removal), which is the user-visible truth we want.
export function removeNoteFromVault(vault, noteId) {
  const note = vault.byId.get(noteId);
  if (!note) return false;
  vault.byId.delete(note.id);
  // Phase 2: byTitle is Map<title, Note[]>. Drop this note from its
  // bucket; delete the key entirely when the bucket becomes empty
  // (keeps the map compact, keeps `has()` checks honest).
  removeFromTitleBucket(vault.byTitle, note);
  const outgoing = vault.forward.get(note.id);
  if (outgoing) {
    for (const targetId of outgoing) {
      vault.backward.get(targetId)?.delete(note.id);
    }
  }
  vault.forward.delete(note.id);
  const incoming = vault.backward.get(note.id);
  if (incoming) {
    for (const sourceId of incoming) {
      vault.forward.get(sourceId)?.delete(note.id);
    }
  }
  vault.backward.delete(note.id);
  const i = vault.notes.indexOf(note);
  if (i !== -1) vault.notes.splice(i, 1);
  vault.stats.notes = vault.notes.length;
  vault.stats.links = countLinks(vault);
  vault.stats.tags = countTags(vault);
  return true;
}

// Re-parse a note after its body has changed. Returns an object describing
// what changed so callers can refresh the scene cheaply.
export function reparseNote(vault, note, newText, settings) {
  const prevTitle = note.title;
  const prevKind = note.kind;
  const prevForward = vault.forward.get(note.id) || new Set();

  const parsed = parseMarkdown(newText, { fallbackName: note.name });

  note.body = parsed.body;
  note.rawText = newText;
  note.frontmatter = parsed.frontmatter;
  note.title = parsed.title;
  note.tags = parsed.tags;
  note.links = parsed.links;
  note.words = parsed.words;
  note.mtime = Date.now();
  note.size = newText.length;
  note._isPhantom = false;

  const newKind = computeKind(note, settings);
  note.kind = newKind;

  if (prevTitle !== note.title) {
    // Phase 2: shift this note from its old title bucket to its new
    // one. Other notes that shared either title remain in place.
    removeFromTitleBucket(vault.byTitle, note, prevTitle.toLowerCase().trim());
    addToTitleBucket(vault.byTitle, note);
  }

  const nextForward = resolveLinkSet(note.links, note, vault);
  vault.forward.set(note.id, nextForward);
  syncBackward(vault, note.id, prevForward, nextForward);

  // Stats: tags + links
  vault.stats.links = countLinks(vault);
  vault.stats.tags = countTags(vault);

  return {
    titleChanged: prevTitle !== note.title,
    kindChanged: prevKind !== newKind,
    prevTitle,
  };
}

// After a title rename, rewrite any `[[OldTitle]]` in other notes. Returns an
// array of { note, newText } the caller then writes to disk.
export function planIncomingLinkRewrites(vault, note, oldTitle) {
  if (!oldTitle || oldTitle === note.title) return [];
  const oldLower = oldTitle.toLowerCase();
  const newTitle = note.title;
  const patches = [];
  for (const other of vault.notes) {
    if (other === note) continue;
    if (!other.rawText) continue;
    // Cheap early-out — skip notes whose body doesn't mention the old title.
    if (!other.rawText.toLowerCase().includes(oldLower)) continue;
    const nextText = rewriteWikilinkTarget(other.rawText, oldTitle, newTitle);
    if (nextText !== other.rawText)
      patches.push({ note: other, text: nextText });
  }
  return patches;
}

// Replace the target (not the alias) of every [[target|alias]] whose target
// matches oldTitle (case-insensitive). Preserves aliases so user display
// is untouched.
export function rewriteWikilinkTarget(text, oldTitle, newTitle) {
  const oldLower = oldTitle.toLowerCase();
  return text.replace(WIKI_ALL_RE, (whole, target, alias) => {
    if (target.trim().toLowerCase() !== oldLower) return whole;
    return `[[${newTitle}${alias ?? ""}]]`;
  });
}

// Serialize a note back to markdown text with auto-maintained frontmatter.
// Keys the app controls: id, created, kind. Anything else the user put in
// frontmatter is preserved verbatim at the top.
export function serializeNote(note, settings) {
  const fm = { ...(note.frontmatter || {}) };
  fm.id = note.id;
  if (!fm.created)
    fm.created = new Date(note.mtime || Date.now()).toISOString();
  const kind = computeKind(note, settings);
  // Only persist `kind:` when the user explicitly overrode it — otherwise
  // it's noise that churns on every tag edit.
  if (fm.kind != null) fm.kind = kind;
  return stringifyFrontmatter(fm, note.body);
}

// On save we want canonical `id` + `created` present but never to churn the
// user's hand-written frontmatter on every keystroke. Only rewrite when we
// actually need to add something.
export function canonicalizeForSave(text, note) {
  const parsed = parseMarkdown(text, { fallbackName: note.name });
  const fm = { ...parsed.frontmatter };
  let changed = false;
  if (!fm.id) {
    fm.id = note.id;
    changed = true;
  }
  if (!fm.created) {
    fm.created = new Date(note.mtime || Date.now()).toISOString();
    changed = true;
  }
  if (!changed)
    return { text, body: parsed.body, frontmatter: parsed.frontmatter };
  const canon = stringifyFrontmatter(fm, parsed.body);
  return { text: canon, body: parsed.body, frontmatter: fm };
}

// Resolve a note's wikilinks into a Set of target note ids. Uses
// vault.resolveTitle so cross-root tie-breaking obeys prefer-same-
// root. Falls back to a local lookup if the vault predates the
// helper (shouldn't happen now, but defensive).
function resolveLinkSet(links, selfNote, vault) {
  const out = new Set();
  const selfId = selfNote?.id || null;
  for (const raw of links) {
    const target = vault.resolveTitle
      ? vault.resolveTitle(raw, selfNote)
      : legacyResolveLink(raw, vault);
    if (!target || target.id === selfId) continue;
    out.add(target.id);
  }
  return out;
}

function legacyResolveLink(raw, vault) {
  const t = String(raw || "").trim();
  if (!t) return null;
  if (vault.byId.has(t)) return vault.byId.get(t);
  const lower = t.toLowerCase();
  const stripped = lower.replace(/\.md$/i, "");
  const bucket = vault.byTitle.get(lower) || vault.byTitle.get(stripped);
  if (!bucket || bucket.length === 0) return null;
  return bucket[0];
}

function syncBackward(vault, selfId, prev, next) {
  for (const id of prev) {
    if (next.has(id)) continue;
    vault.backward.get(id)?.delete(selfId);
  }
  for (const id of next) {
    if (prev.has(id)) continue;
    if (!vault.backward.has(id)) vault.backward.set(id, new Set());
    vault.backward.get(id).add(selfId);
  }
}

function countLinks(vault) {
  let n = 0;
  for (const set of vault.forward.values()) n += set.size;
  return n;
}

function countTags(vault) {
  const all = new Set();
  for (const n of vault.notes) for (const t of n.tags) all.add(t);
  vault.tagCounts = new Map();
  for (const n of vault.notes)
    for (const t of n.tags)
      vault.tagCounts.set(t, (vault.tagCounts.get(t) || 0) + 1);
  return all.size;
}

// Recompute all kinds in one pass. Used when tag→kind mapping changes.
export function recomputeAllKinds(vault, settings) {
  const changed = [];
  for (const n of vault.notes) {
    const prev = n.kind;
    const next = computeKind(n, settings);
    if (prev !== next) {
      n.kind = next;
      changed.push(n);
    }
  }
  return changed;
}
