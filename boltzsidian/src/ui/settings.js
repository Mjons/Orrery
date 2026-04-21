// Settings pane controller. Phase 0: read-only JSON preview, toggled with '\'.
// Phase 1+: becomes an editable form.

export function initSettings({ getSettings }) {
  const pane = document.getElementById("settings");
  const pre = document.getElementById("settings-json");
  if (!pane || !pre)
    return { open: () => {}, close: () => {}, toggle: () => {} };

  function refresh() {
    pre.textContent = JSON.stringify(getSettings(), null, 2);
  }

  function open() {
    refresh();
    pane.classList.add("open");
    pane.setAttribute("aria-hidden", "false");
  }
  function close() {
    pane.classList.remove("open");
    pane.setAttribute("aria-hidden", "true");
  }
  function toggle() {
    pane.classList.contains("open") ? close() : open();
  }

  window.addEventListener("keydown", (e) => {
    if (
      e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement
    )
      return;
    if (e.key === "\\") {
      e.preventDefault();
      toggle();
    } else if (e.key === "Escape" && pane.classList.contains("open")) {
      e.preventDefault();
      close();
    }
  });

  return { open, close, toggle, refresh };
}
