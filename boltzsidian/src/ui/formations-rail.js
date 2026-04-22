// Formations rail — the top-docked pill bar.
//
// Shift+F toggles the rail. 1 / Esc reset every active formation. 2–5
// toggle the other four (Halo, Protostars, Solo-folder, Galactic-core).
// Active pills stay lit so you can read at a glance what lens you're
// looking through.
//
// Solo-folder has a small inline popover: pick a folder name, and the pill
// holds a parameter. Picking again re-opens the popover so users can swap
// folders without clearing the formation.

import { FORMATIONS, availableFolders, formationMeta } from "./formations.js";

const IDLE_DIM_MS = 3000;

export function createFormationsRail({
  getVault,
  formations,
  onBeforeOpen,
  onClose,
}) {
  const rail = document.createElement("div");
  rail.id = "formations-rail";
  rail.setAttribute("aria-hidden", "true");
  rail.setAttribute("role", "toolbar");
  rail.innerHTML = `
    <div class="fr-inner">
      <span class="fr-hint">formations</span>
      <div class="fr-pills"></div>
    </div>
    <div class="fr-popover" hidden></div>
  `;
  document.body.appendChild(rail);

  const pillsEl = rail.querySelector(".fr-pills");
  const popover = rail.querySelector(".fr-popover");
  const pillFor = new Map();

  // Build one pill per formation.
  for (const f of FORMATIONS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "fr-pill";
    btn.dataset.formationId = f.id;
    btn.setAttribute("aria-pressed", "false");
    btn.title = f.tooltip;
    btn.innerHTML = `
      <span class="fr-key">${f.key}</span>
      <span class="fr-label">${f.label}</span>
      <span class="fr-param"></span>
    `;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      handleClick(f);
    });
    pillsEl.appendChild(btn);
    pillFor.set(f.id, btn);
  }

  function handleClick(f) {
    if (f.id === "all") {
      formations.clear();
      closePopover();
      return;
    }
    if (f.needsParam) {
      if (formations.isActive(f.id)) {
        // Offer to swap the folder rather than flipping off.
        openSoloFolderPopover();
      } else {
        openSoloFolderPopover();
      }
      return;
    }
    formations.toggle(f.id);
  }

  function openSoloFolderPopover() {
    const vault = getVault();
    const folders = availableFolders(vault);
    const current = formations.getParams("solo-folder")?.folder || "";

    popover.innerHTML = "";
    if (folders.length === 0) {
      const empty = document.createElement("div");
      empty.className = "fr-popover-empty";
      empty.textContent = "No top-level folders in this vault.";
      popover.appendChild(empty);
    } else {
      for (const f of folders) {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "fr-popover-row";
        row.textContent = `/${f}/`;
        if (f === current) row.dataset.current = "true";
        row.addEventListener("click", (e) => {
          e.stopPropagation();
          formations.set("solo-folder", { folder: f });
          closePopover();
        });
        popover.appendChild(row);
      }
      if (current) {
        const clear = document.createElement("button");
        clear.type = "button";
        clear.className = "fr-popover-row fr-popover-clear";
        clear.textContent = "clear";
        clear.addEventListener("click", (e) => {
          e.stopPropagation();
          formations.remove("solo-folder");
          closePopover();
        });
        popover.appendChild(clear);
      }
    }
    popover.hidden = false;

    // Position below the pill.
    const pill = pillFor.get("solo-folder");
    if (pill) {
      const r = pill.getBoundingClientRect();
      popover.style.left = `${r.left + r.width / 2}px`;
    }
  }

  function closePopover() {
    popover.hidden = true;
    popover.innerHTML = "";
  }

  // Clicking anywhere outside the popover dismisses it.
  document.addEventListener(
    "click",
    (e) => {
      if (popover.hidden) return;
      if (
        e.target instanceof HTMLElement &&
        (e.target.closest(".fr-popover") ||
          e.target.closest(".fr-pill[data-formation-id='solo-folder']"))
      )
        return;
      closePopover();
    },
    true,
  );

  function render({ active }) {
    for (const f of FORMATIONS) {
      const pill = pillFor.get(f.id);
      if (!pill) continue;
      const live = active.includes(f.id);
      pill.setAttribute("aria-pressed", live ? "true" : "false");
      pill.dataset.active = live ? "true" : "false";
      const paramEl = pill.querySelector(".fr-param");
      if (f.id === "solo-folder") {
        const p = formations.getParams("solo-folder");
        paramEl.textContent = p?.folder ? `/${p.folder}/` : "";
      } else {
        paramEl.textContent = "";
      }
    }
    // If at least one formation is active, schedule the idle-dim timer.
    if (active.length > 0) scheduleDim();
    else clearDim();
  }

  // ── Visibility ────────────────────────────────────────
  let open = false;

  function show() {
    if (onBeforeOpen) onBeforeOpen();
    open = true;
    rail.setAttribute("aria-hidden", "false");
    rail.classList.remove("dimmed");
    rail.classList.add("open");
    if (formations.activeIds().length > 0) scheduleDim();
  }

  function hide() {
    open = false;
    closePopover();
    rail.classList.remove("open");
    rail.setAttribute("aria-hidden", "true");
    if (onClose) onClose();
  }

  function toggle() {
    if (open) hide();
    else show();
  }

  // ── Idle dimming ──────────────────────────────────────
  let dimTimer = 0;
  function scheduleDim() {
    clearDim();
    dimTimer = window.setTimeout(() => {
      if (open && formations.activeIds().length > 0)
        rail.classList.add("dimmed");
    }, IDLE_DIM_MS);
  }
  function clearDim() {
    if (dimTimer) {
      clearTimeout(dimTimer);
      dimTimer = 0;
    }
    rail.classList.remove("dimmed");
  }

  window.addEventListener("mousemove", () => {
    if (open && rail.classList.contains("dimmed"))
      rail.classList.remove("dimmed");
    if (open && formations.activeIds().length > 0) scheduleDim();
  });

  // ── Keyboard ──────────────────────────────────────────
  window.addEventListener("keydown", (e) => {
    const isEditable =
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      e.target instanceof HTMLSelectElement ||
      (e.target && e.target.isContentEditable) ||
      (e.target &&
        e.target.closest &&
        (e.target.closest(".cm-editor") ||
          e.target.closest("[contenteditable='true']") ||
          e.target.closest(".tag-prompt-modal") ||
          e.target.closest(".about-modal") ||
          e.target.closest(".morning-report-modal")));
    if (isEditable) return;

    // Shift+F: toggle rail. Use e.code so it survives differing keyboard
    // layouts and so the plain "f" key (no shift) still reaches the editor
    // quickly if it ever binds to something.
    if (e.shiftKey && (e.code === "KeyF" || e.key === "F")) {
      e.preventDefault();
      toggle();
      return;
    }

    // Esc: clear active formations AND hide rail. Only if nothing higher-
    // priority is currently claiming Escape (panels / modals / search).
    if (e.key === "Escape") {
      if (formations.activeIds().length === 0 && !open) return;
      if (
        document.querySelector(
          ".tag-prompt-modal, .about-modal, .morning-report-modal",
        )
      )
        return;
      const notePanelOpen = document
        .getElementById("note-panel")
        ?.classList.contains("open");
      const settingsOpen = document
        .getElementById("settings")
        ?.classList.contains("open");
      const searchOpen = document
        .getElementById("search-strip")
        ?.classList.contains("open");
      if (notePanelOpen || settingsOpen || searchOpen) return;
      e.preventDefault();
      formations.clear();
      hide();
      return;
    }

    // Numeric shortcuts work whenever the rail is open OR a formation is
    // already active (so user can toggle more without re-summoning).
    if (!open && formations.activeIds().length === 0) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const byKey = FORMATIONS.find((f) => f.key === e.key);
    if (!byKey) return;
    e.preventDefault();
    if (byKey.id === "all") {
      formations.clear();
      closePopover();
      return;
    }
    if (byKey.needsParam) {
      if (!open) show();
      openSoloFolderPopover();
      return;
    }
    formations.toggle(byKey.id);
  });

  return {
    show,
    hide,
    toggle,
    render,
    isOpen: () => open,
    dom: rail,
  };
}
