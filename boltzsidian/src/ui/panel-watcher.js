// Panel watcher — observes the five side panels and toggles two body
// classes that the model-face CSS reads to position the avatar:
//
//   body.panels-right-open  — note-panel or settings is open
//   body.panels-left-open   — ideas-drawer, tend-drawer, or weed-drawer is open
//
// The face uses these to *avoid* the busy side. When both are open,
// the face shrinks and drops to the lower centre to minimise overlap.
//
// Implementation: one MutationObserver per panel, watching its
// `class` attribute. Cheap (fires only on class changes), no polling.

const RIGHT_PANELS = ["note-panel", "settings"];
const LEFT_PANELS = ["ideas-drawer", "tend-drawer", "weed-drawer"];

// Weed drawer uses display:none/flex instead of a transform, but its
// open class is still `.open` — handled the same way.

export function initPanelWatcher() {
  const watch = (id, sideClass, sideSet) => {
    const el = document.getElementById(id);
    if (!el) return;
    const update = () => {
      const open = el.classList.contains("open");
      if (open) sideSet.add(id);
      else sideSet.delete(id);
      document.body.classList.toggle(sideClass, sideSet.size > 0);
    };
    update();
    new MutationObserver(update).observe(el, {
      attributes: true,
      attributeFilter: ["class"],
    });
  };
  const rightOpen = new Set();
  const leftOpen = new Set();
  for (const id of RIGHT_PANELS) watch(id, "panels-right-open", rightOpen);
  for (const id of LEFT_PANELS) watch(id, "panels-left-open", leftOpen);
}
