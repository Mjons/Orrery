// CodeMirror 6 host for the note panel.
//
// Scoped light-touch setup: markdown, line wrap, dark accent-aware theme,
// autocomplete on `[[` against the vault's titles and ULIDs, and a tiny
// on-change hook the note panel uses to debounce-autosave.

import { EditorState } from "@codemirror/state";
import {
  EditorView,
  keymap,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
} from "@codemirror/view";
import {
  history,
  historyKeymap,
  defaultKeymap,
  indentWithTab,
} from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import {
  autocompletion,
  completionKeymap,
  closeBrackets,
  closeBracketsKeymap,
} from "@codemirror/autocomplete";

const theme = EditorView.theme(
  {
    "&": {
      height: "100%",
      backgroundColor: "transparent",
      color: "var(--text)",
      fontSize: "14px",
    },
    ".cm-scroller": {
      fontFamily: 'ui-monospace, Menlo, Consolas, "Cascadia Mono", monospace',
      lineHeight: "1.65",
      overflow: "auto",
    },
    ".cm-content": {
      caretColor: "var(--accent)",
      padding: "16px 22px 24px",
      maxWidth: "none",
    },
    ".cm-line": {
      padding: "0 2px",
    },
    ".cm-focused": { outline: "none" },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "var(--accent)",
      borderLeftWidth: "2px",
    },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection":
      {
        backgroundColor: "rgba(138, 180, 255, 0.18)",
      },
    ".cm-gutters": { display: "none" },
    ".cm-tooltip": {
      background: "var(--glass-strong)",
      border: "1px solid var(--glass-border)",
      borderRadius: "10px",
      backdropFilter: "blur(14px)",
      WebkitBackdropFilter: "blur(14px)",
      color: "var(--text)",
      fontFamily: "inherit",
    },
    ".cm-tooltip.cm-tooltip-autocomplete > ul": {
      fontFamily: "inherit",
      fontSize: "13px",
      maxHeight: "280px",
      minWidth: "280px",
    },
    ".cm-tooltip.cm-tooltip-autocomplete > ul > li": {
      padding: "6px 12px",
      lineHeight: "1.4",
    },
    ".cm-tooltip-autocomplete ul li[aria-selected]": {
      background: "rgba(138, 180, 255, 0.14)",
      color: "var(--text)",
    },
    ".cm-completionLabel": { color: "var(--text)" },
    ".cm-completionDetail": {
      color: "var(--text-faint)",
      fontStyle: "normal",
      fontSize: "11px",
      letterSpacing: "0.04em",
      textTransform: "uppercase",
    },
  },
  { dark: true },
);

// Markdown-aware syntax colors, kept minimal and matched to the accent
// vocabulary so the editor reads like part of the glass UI, not a separate app.
const markdownHighlights = EditorView.theme({
  ".cm-line .tok-heading, .cm-line .tok-heading1, .cm-line .tok-heading2, .cm-line .tok-heading3":
    {
      color: "var(--text)",
      fontWeight: "600",
    },
  ".ͼh, .ͼi": { color: "var(--text-dim)" },
});

export function createEditor({
  initialValue,
  onChange,
  onSaveCommit,
  getVault,
}) {
  const container = document.createElement("div");
  container.className = "cm-host";
  container.style.height = "100%";
  container.style.overflow = "hidden";
  container.style.display = "flex";
  container.style.flexDirection = "column";

  const wikilinkCompletion = buildWikilinkSource(getVault);
  const tagCompletion = buildTagSource(getVault);

  const updateListener = EditorView.updateListener.of((update) => {
    if (update.docChanged && onChange) {
      onChange(update.state.doc.toString());
    }
  });

  const saveOnMod = keymap.of([
    {
      key: "Mod-Enter",
      preventDefault: true,
      run: () => {
        if (onSaveCommit) onSaveCommit();
        return true;
      },
    },
  ]);

  const state = EditorState.create({
    doc: initialValue || "",
    extensions: [
      highlightSpecialChars(),
      history(),
      drawSelection(),
      dropCursor(),
      EditorState.allowMultipleSelections.of(true),
      EditorView.lineWrapping,
      markdown(),
      closeBrackets(),
      autocompletion({
        override: [wikilinkCompletion, tagCompletion],
        closeOnBlur: true,
        defaultKeymap: true,
      }),
      keymap.of([
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...historyKeymap,
        ...completionKeymap,
        indentWithTab,
      ]),
      saveOnMod,
      updateListener,
      theme,
      markdownHighlights,
    ],
  });

  const view = new EditorView({ state, parent: container });

  function setValue(next) {
    const cur = view.state.doc.toString();
    if (cur === next) return;
    view.dispatch({
      changes: { from: 0, to: cur.length, insert: next },
    });
  }

  function getValue() {
    return view.state.doc.toString();
  }

  function focus() {
    view.focus();
  }

  function destroy() {
    view.destroy();
    container.remove();
  }

  return {
    dom: container,
    view,
    setValue,
    getValue,
    focus,
    destroy,
  };
}

// Complete `[[partial` with note titles. The vault is pulled on demand so
// the editor can outlive individual vault loads (unlikely, but cheap).
function buildWikilinkSource(getVault) {
  return (context) => {
    const open = context.matchBefore(/\[\[([^\[\]\n]{0,80})$/);
    if (!open) return null;
    if (!context.explicit && open.text === "[[") {
      // Let the user type at least one character before firing unless they
      // explicitly asked (Ctrl-Space). Still return an empty list anchored
      // here so Ctrl-Space opens immediately.
    }
    const vault = getVault && getVault();
    if (!vault) return null;
    const prefix = open.text.slice(2).toLowerCase();
    const options = scoreTitles(vault, prefix)
      .slice(0, 20)
      .map((n) => ({
        label: n.title,
        detail: shortId(n.id),
        apply: `${n.title}]]`,
        type: "class",
      }));
    return {
      from: open.from + 2,
      options,
      validFor: /^[^\[\]\n]*$/,
    };
  };
}

// Complete `#partial` against the vault's existing tags. Sorted by
// frequency of use so common tags surface first, then fuzzy-matched.
// Only fires on `#` that's NOT inside an inline-code span or a link —
// basic heuristic: the # must follow either start-of-line, whitespace,
// an opening paren, or a dash.
function buildTagSource(getVault) {
  return (context) => {
    // Match `#` followed by tag-legal chars ([\w/-]), bounded to 60 chars
    // so a runaway `######` heading-prefix doesn't eat the match.
    const m = context.matchBefore(/(?:^|[\s(\-])#([\w/-]{0,60})$/);
    if (!m) {
      // Also allow the very start of the document.
      const startM = context.matchBefore(/^#([\w/-]{0,60})$/);
      if (!startM) return null;
      return buildTagResult(startM, getVault, 1);
    }
    // Figure out how many chars of leading whitespace/separator to skip
    // so `from` lands right after the `#`. The regex captures (non-#) +
    // `#` + partial, so the # is at m.from + m.text.indexOf('#').
    const hashIdx = m.text.indexOf("#");
    if (hashIdx < 0) return null;
    return buildTagResult(m, getVault, hashIdx + 1);
  };
}

function buildTagResult(m, getVault, offsetAfterHash) {
  const vault = getVault && getVault();
  if (!vault) return null;
  const prefix = m.text.slice(offsetAfterHash).toLowerCase();
  const options = scoreTags(vault, prefix)
    .slice(0, 24)
    .map(([tag, count]) => ({
      label: `#${tag}`,
      detail: count === 1 ? "1 note" : `${count} notes`,
      apply: tag,
      type: "keyword",
    }));
  if (options.length === 0) return null;
  return {
    from: m.from + offsetAfterHash,
    options,
    validFor: /^[\w/-]*$/,
  };
}

function scoreTags(vault, q) {
  const entries = [...(vault.tagCounts || new Map()).entries()];
  if (!q) {
    entries.sort((a, b) => b[1] - a[1] || cmpStr(a[0], b[0]));
    return entries;
  }
  const out = [];
  for (const [tag, count] of entries) {
    const t = tag.toLowerCase();
    let s = -1;
    if (t === q) s = 0;
    else if (t.startsWith(q)) s = 1;
    else if (t.includes(q)) s = 2 + t.indexOf(q);
    else if (matchesLoose(t, q)) s = 50;
    if (s >= 0) out.push({ tag, count, s });
  }
  // Rank by match quality first, then by how often the user actually
  // uses the tag — so common tags beat rare near-matches.
  out.sort((a, b) => a.s - b.s || b.count - a.count || cmpStr(a.tag, b.tag));
  return out.map((x) => [x.tag, x.count]);
}

function scoreTitles(vault, q) {
  if (!q) return vault.notes.slice().sort((a, b) => cmpStr(a.title, b.title));
  const out = [];
  for (const n of vault.notes) {
    const t = n.title.toLowerCase();
    let s = -1;
    if (t === q) s = 0;
    else if (t.startsWith(q)) s = 1;
    else if (t.includes(q)) s = 2 + t.indexOf(q);
    else if (matchesLoose(t, q)) s = 50;
    if (s >= 0) out.push({ n, s });
  }
  out.sort((a, b) => a.s - b.s || cmpStr(a.n.title, b.n.title));
  return out.map((x) => x.n);
}

function matchesLoose(s, q) {
  let i = 0;
  for (const c of s) {
    if (c === q[i]) i++;
    if (i === q.length) return true;
  }
  return false;
}

function cmpStr(a, b) {
  return a.toLowerCase().localeCompare(b.toLowerCase());
}

function shortId(id) {
  if (!id) return "";
  return String(id).slice(-6);
}
