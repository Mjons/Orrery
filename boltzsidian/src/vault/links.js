// Low-level link plumbing: add and remove `[[wikilinks]]` in the body text
// of a note. Every edit is idempotent and preserves the rest of the text
// untouched so diffs stay minimal.

const WIKI_RE = /\[\[([^\]\|\n]+?)(\|[^\]\n]+)?\]\]/g;

// Append `[[Title]]` to the end of body if no existing link resolves to the
// target note. Caller is expected to pass the title/id up-front.
//
// We look at two disqualifiers:
//   1. source already links to target in the vault model (fast path)
//   2. body contains `[[Title]]` or `[[id]]` textually (safety-net for
//      cases where the model hasn't caught up yet)
export function appendWikilinkToBody(body, targetNote, sourceForward) {
  if (alreadyLinks(body, targetNote, sourceForward)) return body;
  const suffix = body.endsWith("\n") ? "" : "\n";
  const sep = body.trim() ? "\n" : "";
  return `${body}${suffix}${sep}[[${targetNote.title}]]\n`;
}

export function alreadyLinks(body, targetNote, sourceForward) {
  if (sourceForward && sourceForward.has(targetNote.id)) return true;
  const titleLower = targetNote.title.toLowerCase();
  const idLower = String(targetNote.id).toLowerCase();
  let m;
  WIKI_RE.lastIndex = 0;
  while ((m = WIKI_RE.exec(body))) {
    const target = m[1].trim().toLowerCase().replace(/\.md$/i, "");
    if (target === titleLower || target === idLower) {
      WIKI_RE.lastIndex = 0;
      return true;
    }
  }
  WIKI_RE.lastIndex = 0;
  return false;
}

// Remove every `[[target]]` / `[[target|alias]]` whose target resolves to
// the given note. Collapses the paragraph it leaves behind if it was the
// sole content on that line.
export function removeWikilinkFromBody(body, targetNote) {
  const titleLower = targetNote.title.toLowerCase();
  const idLower = String(targetNote.id).toLowerCase();
  const next = body.replace(WIKI_RE, (whole, target) => {
    const t = target.trim().toLowerCase().replace(/\.md$/i, "");
    if (t === titleLower || t === idLower) return "";
    return whole;
  });
  // Tidy: collapse any line we just emptied, and remove runs of >2 blank lines.
  return next
    .split("\n")
    .map((line) => (line.trim() === "" ? "" : line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

// Build the new body text for two notes on a link-create operation, without
// writing anything. Caller writes + reparses.
export function planLinkCreate(sourceNote, targetNote, vault) {
  const sourceForward = vault.forward.get(sourceNote.id);
  const nextBody = appendWikilinkToBody(
    sourceNote.body,
    targetNote,
    sourceForward,
  );
  if (nextBody === sourceNote.body) return null;
  const nextText = replaceBody(sourceNote.rawText, sourceNote.body, nextBody);
  return { note: sourceNote, text: nextText, body: nextBody };
}

export function planLinkDelete(sourceNote, targetNote) {
  const nextBody = removeWikilinkFromBody(sourceNote.body, targetNote);
  if (nextBody === sourceNote.body) return null;
  const nextText = replaceBody(sourceNote.rawText, sourceNote.body, nextBody);
  return { note: sourceNote, text: nextText, body: nextBody };
}

// Substitute the body portion of rawText, leaving any frontmatter header
// intact. We assume rawText ends with exactly `body` (parser guarantees it).
function replaceBody(rawText, oldBody, newBody) {
  if (rawText.endsWith(oldBody)) {
    return rawText.slice(0, rawText.length - oldBody.length) + newBody;
  }
  // Safety net — if the rawText and body have drifted (shouldn't happen), just
  // rebuild from frontmatter + newBody by finding the closing `---`.
  const fmMatch = rawText.match(/^---[\s\S]*?\n---\s*\n/);
  if (fmMatch) return fmMatch[0] + newBody;
  return newBody;
}
