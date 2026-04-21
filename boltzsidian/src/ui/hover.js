// Hover controller — makes link + delete gestures legible.
//
// On every pointermove over the canvas we pick the nearest body and the
// nearest tether. Whichever is "about to be interacted with" is:
//   - highlighted in the scene (bodies pulse, tethers brighten)
//   - the cursor reflects the action ("crosshair" for link-drag start,
//     "pointer" for regular click, "not-allowed" on a linked target, etc.)
//   - the #gesture-hint pill surfaces a one-line instruction so first-time
//     users don't have to discover by trial and error
//
// Modifier state (Alt or Shift held) is tracked via window keydown/keyup
// so the cursor and hint update the instant the user presses or releases
// the key, even without moving the mouse.

const BODY_PICK_TOLERANCE = 14;
const BODY_PICK_TOLERANCE_MOD = 28; // when a link-drag modifier is held
const TETHER_PICK_TOLERANCE = 12;

export function createHover({ canvas, bodies, tethers, getIsDragging }) {
  const hintEl = document.getElementById("gesture-hint");
  let modifier = false;
  let lastBodyId = null;
  let lastTetherKey = null; // `${aId}:${bId}` so we can compare cheaply
  let lastClientX = 0;
  let lastClientY = 0;

  function isDragging() {
    return !!(getIsDragging && getIsDragging());
  }

  function onMove(e) {
    lastClientX = e.clientX;
    lastClientY = e.clientY;
    refresh();
  }

  function onKey(e) {
    const next = !!(e.altKey || e.shiftKey);
    if (next === modifier) return;
    modifier = next;
    refresh();
  }

  function refresh() {
    const tol = modifier ? BODY_PICK_TOLERANCE_MOD : BODY_PICK_TOLERANCE;
    const hoverBody = bodies
      ? bodies.pickAt(lastClientX, lastClientY, { tolerance: tol })
      : null;

    // Only look at tethers when we're NOT hovering a body (a body in front
    // of a tether should win the intent).
    let hoverTether = null;
    if (!hoverBody && tethers && !modifier) {
      hoverTether =
        tethers.pickAt(lastClientX, lastClientY, TETHER_PICK_TOLERANCE) || null;
    }

    if (hoverBody !== lastBodyId) {
      lastBodyId = hoverBody;
      bodies?.setHover?.(hoverBody);
    }

    const tetherKey = hoverTether
      ? `${hoverTether.aId}:${hoverTether.bId}`
      : null;
    if (tetherKey !== lastTetherKey) {
      lastTetherKey = tetherKey;
      tethers?.setHover?.(hoverTether);
    }

    updateCursor(hoverBody, hoverTether);
    updateHint(hoverBody, hoverTether);
  }

  function updateCursor(hoverBody, hoverTether) {
    if (!canvas) return;
    if (isDragging()) {
      canvas.style.cursor = hoverBody ? "alias" : "not-allowed";
      return;
    }
    if (modifier) {
      canvas.style.cursor = "crosshair";
    } else if (hoverBody) {
      canvas.style.cursor = "pointer";
    } else if (hoverTether) {
      canvas.style.cursor = "context-menu";
    } else {
      canvas.style.cursor = "";
    }
  }

  function updateHint(hoverBody, hoverTether) {
    if (!hintEl) return;
    let text = "";
    if (isDragging()) {
      text = hoverBody
        ? "release on this star to link"
        : "drag onto a star to link · release to cancel";
    } else if (modifier) {
      text = hoverBody
        ? "click to start a link from this star"
        : "hold <kbd>Alt</kbd> or <kbd>Shift</kbd> and click a star to link";
    } else if (hoverTether) {
      text = "right-click this tether to unlink";
    }
    if (text) {
      hintEl.innerHTML = text;
      hintEl.classList.add("show");
    } else {
      hintEl.classList.remove("show");
    }
  }

  function clear() {
    modifier = false;
    lastBodyId = null;
    lastTetherKey = null;
    bodies?.setHover?.(null);
    tethers?.setHover?.(null);
    if (canvas) canvas.style.cursor = "";
    if (hintEl) hintEl.classList.remove("show");
  }

  window.addEventListener("pointermove", onMove);
  window.addEventListener("keydown", onKey);
  window.addEventListener("keyup", onKey);
  window.addEventListener("blur", () => {
    modifier = false;
    refresh();
  });

  return {
    refresh,
    clear,
    getHoveredId: () => lastBodyId,
  };
}
