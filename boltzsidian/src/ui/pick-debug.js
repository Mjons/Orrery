// Pick-radius debug overlay (PICKING.md §3).
//
// Live-tunable diagnostic. Draws three things:
//   - A 2 px dot at each body's PROJECTED screen position.
//   - A thin ring at its computed catch radius.
//   - A blue crosshair at the current cursor.
//
// Live knobs on `__boltzsidian.debug.pick`:
//   radiusScale     (default 1)  — multiplies every ring
//   offsetX / Y     (default 0)  — shifts every ring + dot in CSS pixels
//   extraTolerance  (default 0)  — extra CSS px added to the catch area
//
// Workflow: dial these until the rings sit on the bright pixels. Report
// the values back — they tell us which term in the projection/radius
// math is wrong.

export function createPickDebug({ getBodies, getOverrides }) {
  const canvas = document.createElement("canvas");
  canvas.id = "pick-debug-overlay";
  Object.assign(canvas.style, {
    position: "fixed",
    inset: "0",
    pointerEvents: "none",
    zIndex: "7",
    display: "none",
  });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  let enabled = false;
  let dpr = 1;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener("resize", resize);

  function update() {
    if (!enabled) return;
    const bodies = getBodies();
    if (!bodies || !bodies.pickDebug) return;
    const snap = bodies.pickDebug();
    const w = window.innerWidth;
    const h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);
    const { count, screen, radii, visible } = snap;

    const o = (getOverrides && getOverrides()) || {};
    const scale = Number.isFinite(o.radiusScale) ? o.radiusScale : 1;
    const offsetX = Number.isFinite(o.offsetX) ? o.offsetX : 0;
    const offsetY = Number.isFinite(o.offsetY) ? o.offsetY : 0;
    const extraTol = Number.isFinite(o.extraTolerance) ? o.extraTolerance : 0;

    ctx.lineWidth = 1;
    for (let i = 0; i < count; i++) {
      if (!visible[i]) continue;
      const r = radii[i];
      if (r <= 0) continue;
      const x = screen[i * 2] + offsetX;
      const y = screen[i * 2 + 1] + offsetY;

      // Projected-center dot — where the picker thinks this body is
      // physically positioned on screen. Brighter than the ring so it
      // reads even when there are many overlapping circles.
      ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Catch ring.
      const drawR = r * scale + extraTol;
      ctx.strokeStyle = "rgba(255, 186, 122, 0.6)";
      ctx.fillStyle = "rgba(255, 186, 122, 0.06)";
      ctx.beginPath();
      ctx.arc(x, y, drawR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    // Crosshair at current cursor.
    if (lastCursorX > -1e5) {
      ctx.strokeStyle = "rgba(138, 180, 255, 0.9)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(lastCursorX - 8, lastCursorY);
      ctx.lineTo(lastCursorX + 8, lastCursorY);
      ctx.moveTo(lastCursorX, lastCursorY - 8);
      ctx.lineTo(lastCursorX, lastCursorY + 8);
      ctx.stroke();
    }
  }

  let lastCursorX = -1e6;
  let lastCursorY = -1e6;
  window.addEventListener("pointermove", (e) => {
    lastCursorX = e.clientX;
    lastCursorY = e.clientY;
  });

  function set(on) {
    enabled = !!on;
    canvas.style.display = enabled ? "block" : "none";
    if (!enabled) {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }
    console.log(`[bz] pick-debug overlay ${enabled ? "on" : "off"}`);
  }

  function toggle() {
    set(!enabled);
  }

  function isEnabled() {
    return enabled;
  }

  return { update, set, toggle, isEnabled };
}
