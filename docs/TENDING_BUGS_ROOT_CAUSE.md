# TENDING_BUGS_ROOT_CAUSE.md — What the tending pipeline is actually doing wrong

Companion to [TENDING_AGENT_MISFIRE_AUDIT.md](TENDING_AGENT_MISFIRE_AUDIT.md)
(symptoms + recovery) and
[TEND_BULK_CRASH.md](TEND_BULK_CRASH.md) / [TEND_BULK_RESET.md](TEND_BULK_RESET.md)
/ [TEND_STAMP_MISMATCH.md](TEND_STAMP_MISMATCH.md) (adjacent bugs in the
same pipeline).

This is the file:line-level diagnosis. Three distinct bugs, one of them
self-amplifying. Every verified against source.

## Scope principle (from the author)

> Tending should only change or add `#tags` and `[[connections]]`.
> Nothing else.

This is the north star for all three fixes and for any future
tending-pipeline work. The pipeline is NOT authorised to:

- rename files
- edit prose outside a tag line or wikilink insertion
- write to frontmatter beyond a minimal `tended_on` stamp
- delete notes
- append bare wikilinks at EOF (links must go **in-prose**, per
  DOCS_AGENT.md Pass 3)

If a proposed change doesn't fit "add/modify a tag" or "add/modify a
wikilink," the tending layer shouldn't be the one doing it. Period.

## The unifying answer up front

Tending itself is not the misbehaving component. The tending passes
produce correct proposals; the user accepts them; then the **saver**
(the generic save path that every edit goes through) does three
independently-broken things in sequence:

1. **Writes corrupted YAML** because the frontmatter serializer
   double-escapes already-escaped strings.
2. **Renames the file** because every save re-derives a filename stem
   from the current H1 and compares it to the current filename.
3. **(Separately)** the obvious-link pass _itself_ appends links to EOF
   instead of inlining them — that one's in the pass, not the saver.

Bug 2 is the reason the rename damage is so violent: _every_ save,
tending or not, triggers a rename attempt. The H1 convention used
throughout the docs folder (`# FILENAME.md — Subtitle`) is adversarial
to the stem-derivation function.

The browser tab running the app is the firing mechanism — while the
tab is open and the vault points at `boltzsidian/src/demo-vault/` or
`docs/`, any accepted proposal writes to disk and trips all three
bugs. Close the tab. Then fix the bugs.

---

## Bug 1 — Escape-runaway frontmatter corruption

**Symptom.** `tended_on` string elements accumulate backslashes each
save — 4 passes in, you get `"obvious-link:...\\\\\\\\"` with 80+
backslashes. Breaks strict YAML parsers.

**Code.** [boltzsidian/src/vault/frontmatter.js:91-100](../boltzsidian/src/vault/frontmatter.js#L91-L100)

```js
function stringifyScalar(v) {
  if (v === null || v === undefined) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return `[${v.map(stringifyScalar).join(", ")}]`;
  const s = String(v);
  if (/[:#\[\]"']/.test(s) || s !== s.trim()) return JSON.stringify(s);
  return s;
}
```

**What goes wrong.**

- `tended_on` is an array of strings like `"obvious-link:01KPS..."`.
- Array branch (line 95) recurses into `stringifyScalar` per element.
- Each element contains `:`, so the regex on line 97 matches and
  `JSON.stringify(s)` runs. That wraps in quotes AND escapes existing
  backslashes.
- When the file is read back via the parser (same module, lines 34-78),
  the parser's JSON-quoted-string detector strips the OUTER quotes but
  does NOT unescape the backslashes. So a value saved as `"foo\\bar"`
  round-trips as `foo\\bar` in memory.
- Next save, `JSON.stringify("foo\\bar")` produces `"foo\\\\bar"`.
- After N saves: `N²` backslashes, loosely.

**Self-amplifying.** Every batch-accept makes the corruption
geometrically worse. This is the highest-severity bug.

**Fix** — stop recursing for string arrays, and normalise quoted
strings on parse:

```js
if (Array.isArray(v)) {
  const items = v.map((x) => {
    const s = String(x);
    return /[:#\[\]"']/.test(s) ? JSON.stringify(s) : s;
  });
  return `[${items.join(", ")}]`;
}
```

And in the parser, when a value parses as a JSON-quoted string, use
`JSON.parse(raw)` — that unescapes correctly — instead of stripping
quotes with a string slice.

---

## Bug 2 — Unauthorised rename on every save

**Symptom.** Filenames mutate into `FOO.md-—-Title.md` (Pattern A) or
`Title-Case-Words.md` (Pattern B) whenever tending or any other edit
flushes. The spec — [DOCS_AGENT.md](DOCS_AGENT.md) — explicitly forbids
file creation and (by extension) rename.

**Code — the rename trigger.** [boltzsidian/src/vault/save.js:77-96](../boltzsidian/src/vault/save.js#L77-L96)

```js
const beforeTitle = note.title;
reparseNote(vault, note, canonText, settings);

const renameResult = await maybeRename(
  vault,
  note,
  beforeTitle,
  settings,
  root,
);
```

**Code — the rename condition.** [boltzsidian/src/vault/save.js:118-153](../boltzsidian/src/vault/save.js#L118-L153)

```js
async function maybeRename(vault, note, beforeTitle, settings, root) {
  const desiredStem = titleToStem(note.title);
  const currentStem = note.name.replace(/\.md$/i, "");
  if (desiredStem === currentStem) return { renamed: false };
  // ... 60s cooldown, then rename + update incoming links
}
```

**Code — the stem function.** [boltzsidian/src/vault/writer.js:94-110](../boltzsidian/src/vault/writer.js#L94-L110)

```js
export function titleToStem(title) {
  let s = String(title || "untitled").trim();
  ...
  s = s.replace(/[\\\/:*?"<>|\x00-\x1f]+/g, "-");  // strip FS-hostile chars
  s = s.replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "");
  // NO period stripping. NO em-dash stripping.
  ...
  return s;
}
```

**What goes wrong.** Walk a concrete example:

1. File on disk: `docs/AMBIENCE.md`. H1 in body:
   `# AMBIENCE.md — Cluster auras and the feel of the universe`.
2. Parser extracts `note.title` = literal H1 text.
3. User (or tending) saves.
4. `reparseNote` re-derives `note.title` from the (unchanged) H1.
5. `titleToStem("AMBIENCE.md — Cluster auras...")` — `.md` is NOT in
   the hostile-chars regex, em-dash isn't either. Spaces get
   hyphenated. Result: `AMBIENCE.md-—-Cluster-auras-and-the-feel-of-the-universe`.
6. `currentStem` = `"AMBIENCE"`. They differ.
7. Past the 60s cooldown, `renameNote` fires. Appending the
   required `.md` extension inside `uniquePath` gives the final
   `AMBIENCE.md-—-Cluster-auras-and-the-feel-of-the-universe.md`.

**The docs folder's `# FILENAME.md — Subtitle` convention is
adversarial to `titleToStem`.** That convention pre-dates the save
pipeline, so every doc whose title starts with its own filename will
rename itself into a double-`.md` monstrosity on first save.

**Pattern B** in the demo-vault is the same mechanism with cleaner
titles: `# M51 Whirlpool Galaxy` → stem `M51-Whirlpool-Galaxy` → rename
from `m51-whirlpool.md` to `M51-Whirlpool-Galaxy.md`. The stem function
works as designed here; the bug is that auto-rename runs at all on a
tending pass that didn't touch the title.

**Fix — smallest version.** Auto-rename should only run when
`note.title` actually changed (i.e., `beforeTitle !== note.title`).
Change [save.js:121](../boltzsidian/src/vault/save.js#L121):

```js
async function maybeRename(vault, note, beforeTitle, settings, root) {
  if (note.title === beforeTitle) return { renamed: false };
  const desiredStem = titleToStem(note.title);
  const currentStem = note.name.replace(/\.md$/i, "");
  if (desiredStem === currentStem) return { renamed: false };
  ...
```

**Fix — stronger version.** Plumb a `skipRename` flag through the
saver and set it `true` for tend proposals:

```js
export function createSaver({ vault, getSettings, onNoteChanged }) {
  return async function save(note, rawText, { skipRename = false } = {}) {
    ...
    const renameResult = skipRename
      ? { renamed: false }
      : await maybeRename(vault, note, beforeTitle, settings, root);
    ...
  };
}
```

Then [tend-apply.js](../boltzsidian/src/layers/tend-apply.js) passes
`{ skipRename: true }`. Tending is metadata work — it should never
rename files.

**Fix — belt-and-braces.** Strip `.md` and em-dashes from
[writer.js:titleToStem](../boltzsidian/src/vault/writer.js#L98):

```js
s = s.replace(/\.md\b/gi, ""); // never let ".md" slip into a stem
s = s.replace(/[\\\/:*?"<>|—\x00-\x1f]+/g, "-"); // em-dash → hyphen
```

Even if auto-rename DID fire with the author's intended title, it
would produce a sensible stem instead of a double-extension horror.

---

## Bug 3 — Orphan wikilinks appended to EOF

**Symptom.** Bare `[[Title]]` blocks stack up at the bottom of every
note, one per blank-line. Some target real notes, some target phrases
that aren't notes (`[[new]]`, `[[One accent]]`), all of them sit below
the trailing `#tag` line with no prose context.

**Code.** [boltzsidian/src/layers/tend-apply.js:102-118](../boltzsidian/src/layers/tend-apply.js#L102-L118)

```js
export function applyObviousLink(note, proposal, vault) {
  const target = vault?.byId?.get(proposal.linkTargetId);
  if (!target) return note.rawText;
  // Reuse Phase 3's planLinkCreate behaviour: append `[[Target Title]]`
  // at the end of the body if not already present.
  const body = note.body || "";
  const already = new RegExp(
    `\\[\\[\\s*${escapeRegex(target.title)}\\s*(?:\\|[^\\]]*)?\\]\\]`,
    "i",
  ).test(body);
  if (already) return note.rawText;
  const trimmed = body.replace(/\s+$/, "");
  const sep = trimmed ? "\n\n" : "";
  const newBody = `${trimmed}${sep}[[${target.title}]]\n`;
  return replaceBody(note.rawText, body, newBody);
}
```

**What goes wrong.** The comment on line 105 admits the intent: _append
at the end of the body_. That directly contradicts
[DOCS_AGENT.md Pass 3](DOCS_AGENT.md#L84): _"Replace the FIRST match per
paragraph with `[[STEM]]`"_. The detector `detectObviousLinks`
elsewhere in tend.js correctly scans prose for the first mention — but
the applier ignores that position and just appends.

**Why the orphan set grows.** `alreadyLinked` on line 113 checks the
_entire body_. Once `[[Target]]` has been appended, the applier never
re-applies for that pair. So on the next pass, a DIFFERENT target gets
appended, stacking another bare wikilink below the last one. After N
proposals, N orphan wikilinks accumulate at EOF.

**Why some are bogus.** Proposals for targets with human-phrase titles
(`[[new]]`, `[[One accent]]`) appear because the detector matched a
short common word in the prose. The spec says skip stems shorter than
3 chars and skip synonym phrases, but the proposer is looser than the
spec — it treats any title the parser found as a link candidate.

**Fix.** Rewrite `applyObviousLink` to honour Pass 3 — replace the
first in-prose mention, or if the proposal carries an explicit byte
offset, splice at that offset:

```js
export function applyObviousLink(note, proposal, vault) {
  const target = vault?.byId?.get(proposal.linkTargetId);
  if (!target) return note.rawText;
  const body = note.body || "";
  // Skip if already linked anywhere (including existing wikilinks).
  const linkRe = new RegExp(
    `\\[\\[\\s*${escapeRegex(target.title)}\\s*(?:\\|[^\\]]*)?\\]\\]`,
    "i",
  );
  if (linkRe.test(body)) return note.rawText;
  // Replace the FIRST prose mention only. Use a word-boundary,
  // case-insensitive, outside-code-blocks check.
  const phraseRe = new RegExp(`\\b${escapeRegex(target.title)}\\b`, "i");
  const m = phraseRe.exec(body);
  if (!m) return note.rawText; // no in-prose mention → nothing to do
  const newBody =
    body.slice(0, m.index) +
    `[[${target.title}]]` +
    body.slice(m.index + m[0].length);
  return replaceBody(note.rawText, body, newBody);
}
```

Exclude matches inside code fences / frontmatter for full correctness
(DOCS_AGENT.md Pass 3 skips those); that requires a small scanner but
is mechanical. Alternatively, gate this whole pass behind a
user-preference toggle until it's trustworthy.

---

## Severity + fix ordering

| #   | Bug                 | Severity                                  | Fix complexity                     | Order     |
| --- | ------------------- | ----------------------------------------- | ---------------------------------- | --------- |
| 1   | Escape runaway      | Critical (self-amplifying, corrupts YAML) | 6 lines                            | **First** |
| 2   | Auto-rename on save | High (vault reorganises itself)           | 1 line (smallest) / 10 (strongest) | Second    |
| 3   | EOF wikilink dump   | Medium (noisy, reversible)                | 15 lines                           | Third     |

Bug 1 first — once it compounds a few times it breaks frontmatter
parsing, which breaks everything downstream.

Bug 2 second — the damage is the most user-visible (filenames change
under the user's feet), and the smallest fix is a single-line title-equality guard.

Bug 3 third — ugly but self-contained; existing files can be cleaned
with `git restore`.

## One-line kill-switch while we fix this

Before any of the above lands, gate the saver's auto-rename on a
setting default-false:

```js
if (settings.auto_rename_on_title !== true) return { renamed: false };
```

Drop that in [save.js:121](../boltzsidian/src/vault/save.js#L121) at
the top of `maybeRename`. The feature is off for everyone until
someone opts in. Fixes Bug 2's blast radius while the three real fixes
are being written.

## Tests worth adding

- `frontmatter.stringifyScalar` round-trip of an array of
  colon-containing strings should be idempotent under 10 save cycles.
  Today it fails at cycle 2.
- `titleToStem("AMBIENCE.md — Cluster auras")` should NOT contain the
  substring `.md-—-`. Today it does.
- `applyObviousLink(note, proposal)` on a note whose body doesn't
  mention the target phrase should be a no-op. Today it appends.
- `applyObviousLink` applied twice in a row for different targets
  should NOT stack EOF wikilinks. Today it does.

#tending #bug #root-cause #frontmatter #rename
