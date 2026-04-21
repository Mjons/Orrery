// Minimal toast — bottom center, 3s fade. Used for errors and lightweight
// confirmations. Not for anything modal.

let hideTimer = 0;

export function toast(message, { duration = 3000 } = {}) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  if (hideTimer) clearTimeout(hideTimer);
  hideTimer = window.setTimeout(() => el.classList.remove("show"), duration);
}
