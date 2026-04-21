// Hotkey overlay — a modal that lists every keyboard shortcut and
// mouse gesture the app responds to, grouped by concern. Opened from
// Settings → Help.
//
// The catalog is authored here rather than pulled from the live
// keyboard handlers. The live handlers are scattered across main.js,
// ui/search.js, ui/note-panel.js, ui/link-drag.js — a central doc is
// what the user wants, and auto-derivation would add a lot of hooks
// for something that changes rarely. When a new hotkey lands, edit
// GROUPS below.

const GROUPS = [
  {
    title: "Navigate",
    items: [
      { keys: ["click"], desc: "Open a note (body or label)" },
      { keys: ["Cmd", "K"], desc: "Open search" },
      { keys: ["/"], desc: "Open search (same as Cmd+K)" },
      { keys: ["↑", "↓"], desc: "Move selection in search" },
      { keys: ["Enter"], desc: "Open the selected search result" },
      { keys: ["Esc"], desc: "Close whatever's open (panel, drawer, modal)" },
    ],
  },
  {
    title: "Write",
    items: [
      { keys: ["N"], desc: "New note" },
      { keys: ["E"], desc: "Toggle read / edit mode in the note panel" },
      { keys: ["Cmd", "Enter"], desc: "Save + close the note panel" },
      {
        keys: ["Alt", "drag"],
        desc: "Drag from one body to another to create a link",
      },
      {
        keys: ["Shift", "drag"],
        desc: "Alternate link-drag shortcut (same as Alt)",
      },
      {
        keys: ["Alt", "right-click"],
        desc: "Delete a tether under the cursor (Shift works too)",
      },
    ],
  },
  {
    title: "Drawers + panels",
    items: [
      { keys: ["I"], desc: "Toggle the Ideas drawer" },
      {
        keys: ["T"],
        desc: "Run Tend + open drawer (or toggle if already loaded)",
      },
      {
        keys: ["W"],
        desc: "Open Weed drawer (or toggle if already loaded)",
      },
      { keys: ["\\"], desc: "Toggle the Settings pane" },
      { keys: ["L"], desc: "Cycle label mode (always / hover / never)" },
    ],
  },
  {
    title: "Dream",
    items: [
      { keys: ["D"], desc: "Show morning report for last dream cycle" },
      { keys: ["Shift", "D"], desc: "Dream now — start a cycle immediately" },
      {
        keys: ["any key", "/", "click", "scroll"],
        desc: "Wakes a running dream early (mouse movement does NOT wake)",
      },
    ],
  },
  {
    title: "Debug",
    items: [
      {
        keys: ["Shift", "S"],
        desc: "Open the salience debug palette (live-tune scoring)",
      },
    ],
  },
];

export function showHotkeyOverlay() {
  const modal = document.createElement("div");
  modal.className = "hotkey-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-labelledby", "hk-title");
  modal.innerHTML = template();

  function close() {
    modal.classList.remove("show");
    document.removeEventListener("keydown", onKey, true);
    setTimeout(() => modal.remove(), 180);
  }
  function onKey(e) {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  }
  modal.addEventListener("click", (e) => {
    if (!(e.target instanceof HTMLElement)) return;
    if (e.target === modal) {
      close();
      return;
    }
    if (e.target.closest(".hk-close")) close();
  });
  document.addEventListener("keydown", onKey, true);

  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add("show"));
  return { close };
}

function template() {
  const sections = GROUPS.map(
    (g) => `
    <section class="hk-section">
      <h3>${escapeHtml(g.title)}</h3>
      <ul class="hk-rows">
        ${g.items
          .map(
            (item) => `
          <li class="hk-row">
            <span class="hk-keys">${renderKeys(item.keys)}</span>
            <span class="hk-desc">${escapeHtml(item.desc)}</span>
          </li>`,
          )
          .join("")}
      </ul>
    </section>`,
  ).join("");

  return `
    <div class="hk-card">
      <header class="hk-head">
        <div>
          <h2 id="hk-title">Hotkeys</h2>
          <p class="hk-sub">Everything the app responds to.</p>
        </div>
        <button class="hk-close" type="button" aria-label="Close">×</button>
      </header>
      <div class="hk-body">${sections}</div>
      <footer class="hk-foot">
        <span class="hk-note">Modifiers are Shift / Cmd / Alt / Ctrl (Cmd on macOS, Ctrl on Windows / Linux).</span>
      </footer>
    </div>
  `;
}

function renderKeys(keys) {
  return keys
    .map((k) => {
      // Plain words like "click" / "drag" / "any key" render as a
      // subdued pill; actual keys render as a bold kbd-style pill.
      const plain = /^(click|drag|scroll|any key)$/i.test(k);
      const cls = plain ? "hk-key hk-key-word" : "hk-key";
      return `<span class="${cls}">${escapeHtml(k)}</span>`;
    })
    .join('<span class="hk-key-sep">+</span>');
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
