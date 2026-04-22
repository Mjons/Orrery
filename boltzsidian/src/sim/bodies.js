// Body rendering: one GL point per note, click raycasting, mass-driven sizing,
// per-body kind tint mixed with the accent.
//
// The geometry is pre-allocated with headroom so notes created in-session
// (Cmd+N) can land in the same buffer without a rebuild.

import * as THREE from "three";
import { KIND_TINTS, NUM_KINDS } from "../vault/kind.js";
import { tintRgbForNote, topLevelFolder } from "../vault/folders.js";

const TMP_V = new THREE.Vector3();
const HEADROOM = 256; // extra slots for in-session Cmd+N

// Single source of truth for a body's on-screen size. The vertex shader
// computes `gl_PointSize` with the exact same factors — if this formula
// and the shader ever drift, picking stops matching what's drawn.
//
// Derivation: gl_PointSize is in framebuffer (device) pixels. CSS pixels
// = framebuffer pixels / pixelRatio. The shader multiplies by uPixelRatio
// so the sprite keeps a consistent CSS-pixel size across DPIs. Therefore:
//
//   cssDiameter = baseSize * densSize * pulse * (420 / zDist) * 0.5
//   cssRadius   = cssDiameter * 0.5
//
// We average `pulse` at 0.95 and intentionally omit selection / hover /
// label-hover boosts — those are state feedback on top of an already-
// picked body; expanding the catch radius during interaction creates a
// sticky-selection feedback loop where the cursor is harder to leave.
const PULSE_AVG = 0.95;
export function cssPixelRadius({ mass, density = 0, zDist, densityBoost = 1 }) {
  if (!(zDist > 0)) return 0;
  const densSize = 1 + density * densityBoost * 0.45;
  const baseSize = (4 + Math.sqrt(Math.max(1, mass)) * 5) * densSize;
  return baseSize * PULSE_AVG * (420 / zDist) * 0.25;
}

export function createBodies({
  scene,
  camera,
  vault,
  positions,
  renderer,
  getSettings,
}) {
  const live = vault.notes.length;
  const capacity = live + HEADROOM;

  const pos = new Float32Array(capacity * 3);
  const vel = new Float32Array(capacity * 3);
  const mass = new Float32Array(capacity);
  const phase = new Float32Array(capacity);
  const kind = new Float32Array(capacity);
  const folderTint = new Float32Array(capacity * 3);
  const glow = new Float32Array(capacity);
  const selected = new Float32Array(capacity);
  // Per-body hover indicator — 0 normally, 1 when the cursor is on this body.
  // Independent of `selected` so hover doesn't clobber the clicked-selection ring.
  const hover = new Float32Array(capacity);
  // Per-body label-hover — set when the DOM label next to the body is
  // pointed at. Currently wired to 0 everywhere; the attribute exists so
  // geometry layout stays stable until labels.js starts driving it.
  const labelHover = new Float32Array(capacity);
  const pinned = new Uint8Array(capacity);
  const folderIdx = new Int32Array(capacity); // top-level folder id, -1 = none
  const density = new Float32Array(capacity); // 0..1 local neighbor density
  const noteIds = new Array(capacity);
  const indexOf = new Map();

  // Folder-index ↔ name bi-map. Populated lazily so new notes created in
  // a folder we've never seen still get a stable index.
  const folderNameOf = []; // index → name
  const folderIndexOf = new Map(); // name → index

  function folderIndexFor(name) {
    if (!name) return -1;
    const existing = folderIndexOf.get(name);
    if (existing != null) return existing;
    const idx = folderNameOf.length;
    folderNameOf.push(name);
    folderIndexOf.set(name, idx);
    return idx;
  }

  for (let i = 0; i < live; i++) {
    const note = vault.notes[i];
    const p = positions[note.id] || [0, 0, 0];
    writeSlot(i, {
      note,
      position: p,
    });
  }

  function writeSlot(i, { note, position }) {
    pos[i * 3 + 0] = position[0];
    pos[i * 3 + 1] = position[1];
    pos[i * 3 + 2] = position[2];
    vel[i * 3 + 0] = 0;
    vel[i * 3 + 1] = 0;
    vel[i * 3 + 2] = 0;
    const backlinks = vault.backward.get(note.id)?.size || 0;
    const words = Math.max(1, note.words || 0);
    mass[i] = 1 + backlinks * 0.8 + Math.log(1 + words) * 0.55;
    phase[i] = Math.random() * Math.PI * 2;
    kind[i] = note.kind || 0;
    glow[i] = 1.0;
    selected[i] = 0;
    labelHover[i] = 0;
    pinned[i] = note.frontmatter && note.frontmatter.pinned ? 1 : 0;

    const settings = getSettings ? getSettings() : {};
    const tint = tintRgbForNote(note, settings);
    folderTint[i * 3 + 0] = tint[0];
    folderTint[i * 3 + 1] = tint[1];
    folderTint[i * 3 + 2] = tint[2];

    const folder = topLevelFolder(note.path);
    folderIdx[i] = folder ? folderIndexFor(folder) : -1;

    const d = vault.densityById?.get(note.id);
    density[i] = typeof d === "number" ? d : 0;

    noteIds[i] = note.id;
    indexOf.set(note.id, i);
  }

  const geom = new THREE.BufferGeometry();
  geom.setAttribute(
    "position",
    new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage),
  );
  geom.setAttribute(
    "aMass",
    new THREE.BufferAttribute(mass, 1).setUsage(THREE.DynamicDrawUsage),
  );
  geom.setAttribute("aPhase", new THREE.BufferAttribute(phase, 1));
  geom.setAttribute(
    "aKind",
    new THREE.BufferAttribute(kind, 1).setUsage(THREE.DynamicDrawUsage),
  );
  geom.setAttribute(
    "aGlow",
    new THREE.BufferAttribute(glow, 1).setUsage(THREE.DynamicDrawUsage),
  );
  geom.setAttribute(
    "aSelected",
    new THREE.BufferAttribute(selected, 1).setUsage(THREE.DynamicDrawUsage),
  );
  geom.setAttribute(
    "aHover",
    new THREE.BufferAttribute(hover, 1).setUsage(THREE.DynamicDrawUsage),
  );
  geom.setAttribute(
    "aFolderTint",
    new THREE.BufferAttribute(folderTint, 3).setUsage(THREE.DynamicDrawUsage),
  );
  geom.setAttribute(
    "aLocalDensity",
    new THREE.BufferAttribute(density, 1).setUsage(THREE.DynamicDrawUsage),
  );
  geom.setAttribute(
    "aLabelHover",
    new THREE.BufferAttribute(labelHover, 1).setUsage(THREE.DynamicDrawUsage),
  );

  let liveCount = live;
  geom.setDrawRange(0, liveCount);

  const kindTints = new Float32Array(NUM_KINDS * 3);
  for (let k = 0; k < NUM_KINDS; k++) {
    const t = KIND_TINTS[k] || KIND_TINTS[0];
    kindTints[k * 3 + 0] = t[0];
    kindTints[k * 3 + 1] = t[1];
    kindTints[k * 3 + 2] = t[2];
  }

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uAccent: { value: new THREE.Color(getAccent()) },
      uPixelRatio: { value: renderer.getPixelRatio() },
      uKindTints: { value: kindTints },
      uNumKinds: { value: NUM_KINDS },
      uDensityBoost: { value: 1.0 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aMass;
      attribute float aPhase;
      attribute float aKind;
      attribute float aGlow;
      attribute float aSelected;
      attribute float aHover;
      attribute float aLabelHover;
      attribute vec3 aFolderTint;
      attribute float aLocalDensity;
      uniform float uTime;
      uniform float uPixelRatio;
      uniform float uDensityBoost;
      varying float vGlow;
      varying float vSelected;
      varying float vHover;
      varying float vLabelHover;
      varying float vPulse;
      varying float vKind;
      varying vec3 vFolderTint;
      varying float vDensity;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        float densSize = 1.0 + aLocalDensity * uDensityBoost * 0.45;
        float baseSize = (4.0 + sqrt(aMass) * 5.0) * densSize;
        float pulse = 0.9 + 0.1 * sin(uTime * 0.8 + aPhase * 2.3);
        float selBoost = 1.0 + aSelected * 0.75;
        // Hover pulses the body ~12% larger so the user sees which star is
        // about to receive a click.
        float hoverBoost = 1.0 + aHover * 0.12 * (1.0 + 0.35 * sin(uTime * 6.0));
        // Label hover — double the body's size with a steady breathing pulse
        // so the associated star is unmistakable when the user engages a label.
        float labelBoost = 1.0 + aLabelHover * (1.0 + 0.18 * sin(uTime * 4.5));
        // Filter match — when the formations/filter pipeline is active,
        // matched bodies have aGlow = 1.3 (non-matches 0.2, no filter 1.0).
        // Grow matches 3x so the user's attention snaps to them even
        // across a dimmed vault. Unaffected when no filter is active.
        float filterBoost = 1.0 + step(1.1, aGlow) * 2.0;
        gl_PointSize = baseSize * pulse * selBoost * hoverBoost * labelBoost * filterBoost * (420.0 / -mv.z) * uPixelRatio * 0.5;
        vGlow = aGlow;
        vSelected = aSelected;
        vHover = aHover;
        vLabelHover = aLabelHover;
        vPulse = pulse;
        vKind = aKind;
        vFolderTint = aFolderTint;
        vDensity = aLocalDensity;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uAccent;
      uniform float uKindTints[${NUM_KINDS * 3}];
      uniform int uNumKinds;
      uniform float uDensityBoost;
      varying float vGlow;
      varying float vSelected;
      varying float vHover;
      varying float vLabelHover;
      varying float vPulse;
      varying float vKind;
      varying vec3 vFolderTint;
      varying float vDensity;
      vec3 tintFor(float k) {
        int idx = int(clamp(k + 0.5, 0.0, float(uNumKinds - 1)));
        int base = idx * 3;
        return vec3(uKindTints[base + 0], uKindTints[base + 1], uKindTints[base + 2]);
      }
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r = length(d);
        if (r > 0.5) discard;
        float core = smoothstep(0.5, 0.0, r);
        float halo = smoothstep(0.5, 0.12, r) * 0.55;
        float ring = vSelected * smoothstep(0.5, 0.36, r) * (1.0 - smoothstep(0.36, 0.22, r)) * 1.4;
        // Hover ring — slightly outside the selection ring so they don't fight.
        float hoverRing = vHover * smoothstep(0.5, 0.44, r) * (1.0 - smoothstep(0.44, 0.38, r)) * 1.8;

        vec3 kindTint = tintFor(vKind);
        // Core leans toward kind tint; selection pulls back toward accent.
        vec3 coreCol = mix(kindTint, uAccent, 0.28 + vSelected * 0.45);
        // Label hover — unmistakable orange flare. Mixes hard toward orange
        // and brightens the outer halo so the star broadcasts "this one."
        vec3 labelOrange = vec3(1.0, 0.48, 0.12);
        coreCol = mix(coreCol, labelOrange, vLabelHover * 0.85);
        float labelRing = vLabelHover * smoothstep(0.5, 0.40, r) * (1.0 - smoothstep(0.40, 0.24, r)) * 2.2;

        // Folder aura — a coloured contribution to the outer halo only.
        // The core colour is untouched so "what kind of thought" still reads
        // from the centre regardless of which folder the note is in.
        float tintStrength = dot(vFolderTint, vec3(1.0)) > 0.001 ? 1.0 : 0.0;
        float halo3 = smoothstep(0.5, 0.32, r) * (1.0 - smoothstep(0.32, 0.18, r));
        vec3 aura = vFolderTint * halo3 * tintStrength * 0.9;

        // Density-aware emission — clustered bodies read brighter, so the
        // bloom pass pools them into a collective glow over the cluster.
        float emission = 1.0 + vDensity * uDensityBoost;

        vec3 col = (coreCol * (core + halo) + aura) * emission + uAccent * hoverRing;
        float alpha = (core + halo + ring + hoverRing + halo3 * tintStrength * 0.4) * vGlow * vPulse
                    * (0.85 + vDensity * uDensityBoost * 0.4);
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });

  const points = new THREE.Points(geom, mat);
  points.frustumCulled = false;
  scene.add(points);

  const screen = new Float32Array(capacity * 2);
  const screenRadii = new Float32Array(capacity);
  const visible = new Uint8Array(capacity);
  // Floor so a tiny far-away star still has a clickable catch area; the
  // rendered sprite may be sub-pixel but the user still wants to aim at it.
  const MIN_PICK_RADIUS = 6;

  function updateScreen() {
    // Use the canvas's actual rect, not the window. If anything in the app
    // shell offsets the canvas from the viewport origin (a sidebar, a
    // floating panel, browser chrome we don't control), the projected
    // coordinates have to include that offset so they line up with the
    // pointer events (which give viewport-absolute clientX/Y).
    const rect = renderer.domElement.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const ox = rect.left;
    const oy = rect.top;
    const e = camera.matrixWorldInverse.elements;
    const dBoost = mat.uniforms.uDensityBoost.value ?? 1.0;
    for (let i = 0; i < liveCount; i++) {
      const x = pos[i * 3];
      const y = pos[i * 3 + 1];
      const z = pos[i * 3 + 2];
      // Camera-space z via the 3rd row of the view matrix. Matches
      // `modelViewMatrix * position` used by the shader.
      const zCam = e[2] * x + e[6] * y + e[10] * z + e[14];
      const zDist = -zCam;
      TMP_V.set(x, y, z);
      TMP_V.project(camera);
      const behind = TMP_V.z >= 1 || zDist <= 0;
      visible[i] = behind ? 0 : 1;
      screen[i * 2] = ox + (TMP_V.x * 0.5 + 0.5) * w;
      screen[i * 2 + 1] = oy + (1 - (TMP_V.y * 0.5 + 0.5)) * h;
      screenRadii[i] = behind
        ? 0
        : Math.max(
            MIN_PICK_RADIUS,
            cssPixelRadius({
              mass: mass[i],
              density: density[i],
              zDist,
              densityBoost: dBoost,
            }),
          );
    }
  }

  function pickAt(clientX, clientY, { tolerance = 10 } = {}) {
    updateScreen();
    let bestId = null;
    let bestScore = Infinity;
    for (let i = 0; i < liveCount; i++) {
      if (!visible[i]) continue;
      const dx = screen[i * 2] - clientX;
      const dy = screen[i * 2 + 1] - clientY;
      const d = Math.sqrt(dx * dx + dy * dy);
      const radius = screenRadii[i];
      if (d > radius + tolerance) continue;
      const score = d / radius;
      if (score < bestScore) {
        bestScore = score;
        bestId = noteIds[i];
      }
    }
    return bestId;
  }

  function setSelected(noteId) {
    selected.fill(0);
    if (noteId != null && indexOf.has(noteId))
      selected[indexOf.get(noteId)] = 1;
    geom.getAttribute("aSelected").needsUpdate = true;
  }

  function setLabelHover(noteId) {
    labelHover.fill(0);
    if (noteId != null && indexOf.has(noteId))
      labelHover[indexOf.get(noteId)] = 1;
    geom.getAttribute("aLabelHover").needsUpdate = true;
  }

  function setHover(noteId) {
    hover.fill(0);
    if (noteId != null && indexOf.has(noteId)) hover[indexOf.get(noteId)] = 1;
    geom.getAttribute("aHover").needsUpdate = true;
  }

  function setGlowFilter(matchIds) {
    if (!matchIds) {
      for (let i = 0; i < liveCount; i++) glow[i] = 1.0;
    } else {
      const set = matchIds instanceof Set ? matchIds : new Set(matchIds);
      for (let i = 0; i < liveCount; i++)
        glow[i] = set.has(noteIds[i]) ? 1.3 : 0.2;
    }
    geom.getAttribute("aGlow").needsUpdate = true;
  }

  function positionOf(noteId) {
    const i = indexOf.get(noteId);
    if (i == null) return null;
    return [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
  }

  function addBody(note, position) {
    if (liveCount >= capacity) {
      console.warn("[bz] body capacity reached; skip add", note.id);
      return null;
    }
    const i = liveCount;
    writeSlot(i, { note, position });
    liveCount++;
    geom.setDrawRange(0, liveCount);
    markDirty();
    return i;
  }

  // Remove a body from the live slot range. Swap-with-last + decrement:
  // cheap, stable enough for Weed-scale (handful of archive/delete per
  // session). Returns true if a slot was actually removed. Callers are
  // expected to rebuild tether geometry + physics edges afterward.
  function removeBody(noteId) {
    const i = indexOf.get(noteId);
    if (i == null) return false;
    const last = liveCount - 1;
    indexOf.delete(noteId);
    if (i !== last) {
      // Copy last slot into i, then shrink.
      pos[i * 3 + 0] = pos[last * 3 + 0];
      pos[i * 3 + 1] = pos[last * 3 + 1];
      pos[i * 3 + 2] = pos[last * 3 + 2];
      vel[i * 3 + 0] = vel[last * 3 + 0];
      vel[i * 3 + 1] = vel[last * 3 + 1];
      vel[i * 3 + 2] = vel[last * 3 + 2];
      mass[i] = mass[last];
      phase[i] = phase[last];
      kind[i] = kind[last];
      folderTint[i * 3 + 0] = folderTint[last * 3 + 0];
      folderTint[i * 3 + 1] = folderTint[last * 3 + 1];
      folderTint[i * 3 + 2] = folderTint[last * 3 + 2];
      glow[i] = glow[last];
      selected[i] = selected[last];
      hover[i] = hover[last];
      labelHover[i] = labelHover[last];
      pinned[i] = pinned[last];
      folderIdx[i] = folderIdx[last];
      density[i] = density[last];
      noteIds[i] = noteIds[last];
      indexOf.set(noteIds[i], i);
    }
    noteIds[last] = undefined;
    liveCount--;
    geom.setDrawRange(0, liveCount);
    markDirty();
    return true;
  }

  function updateBody(noteId, { note, mass: newMass, kind: newKind } = {}) {
    const i = indexOf.get(noteId);
    if (i == null) return;
    if (note) {
      const backlinks = vault.backward.get(note.id)?.size || 0;
      const words = Math.max(1, note.words || 0);
      mass[i] = 1 + backlinks * 0.8 + Math.log(1 + words) * 0.55;
      kind[i] = note.kind || 0;
    }
    if (newMass != null) mass[i] = newMass;
    if (newKind != null) kind[i] = newKind;
    geom.getAttribute("aMass").needsUpdate = true;
    geom.getAttribute("aKind").needsUpdate = true;
  }

  function refreshAllKinds() {
    for (let i = 0; i < liveCount; i++) {
      const n = vault.byId.get(noteIds[i]);
      if (n) kind[i] = n.kind || 0;
    }
    geom.getAttribute("aKind").needsUpdate = true;
  }

  function refreshAllDensities() {
    for (let i = 0; i < liveCount; i++) {
      const d = vault.densityById?.get(noteIds[i]);
      density[i] = typeof d === "number" ? d : 0;
    }
    geom.getAttribute("aLocalDensity").needsUpdate = true;
  }

  function setDensityBoost(v) {
    mat.uniforms.uDensityBoost.value = Math.max(0, Number(v) || 0);
  }

  function refreshAllFolderTints() {
    const settings = getSettings ? getSettings() : {};
    for (let i = 0; i < liveCount; i++) {
      const n = vault.byId.get(noteIds[i]);
      if (!n) continue;
      const tint = tintRgbForNote(n, settings);
      folderTint[i * 3 + 0] = tint[0];
      folderTint[i * 3 + 1] = tint[1];
      folderTint[i * 3 + 2] = tint[2];
    }
    geom.getAttribute("aFolderTint").needsUpdate = true;
  }

  function moveBody(noteId, position) {
    const i = indexOf.get(noteId);
    if (i == null) return;
    pos[i * 3] = position[0];
    pos[i * 3 + 1] = position[1];
    pos[i * 3 + 2] = position[2];
    geom.getAttribute("position").needsUpdate = true;
  }

  function setPinned(noteId, isPinned) {
    const i = indexOf.get(noteId);
    if (i == null) return;
    pinned[i] = isPinned ? 1 : 0;
    if (isPinned) {
      vel[i * 3] = vel[i * 3 + 1] = vel[i * 3 + 2] = 0;
    }
  }

  function isPinnedById(noteId) {
    const i = indexOf.get(noteId);
    return i != null ? !!pinned[i] : false;
  }

  function massOf(noteId) {
    const i = indexOf.get(noteId);
    return i != null ? mass[i] : 0;
  }

  function indexOfId(noteId) {
    const i = indexOf.get(noteId);
    return i == null ? -1 : i;
  }

  function markPositionsDirty() {
    geom.getAttribute("position").needsUpdate = true;
  }

  function markDirty() {
    geom.getAttribute("position").needsUpdate = true;
    geom.getAttribute("aMass").needsUpdate = true;
    geom.getAttribute("aKind").needsUpdate = true;
    geom.getAttribute("aGlow").needsUpdate = true;
    geom.getAttribute("aSelected").needsUpdate = true;
  }

  // Debug hook — returns a read-only snapshot of the picker's internal
  // state, refreshing the projection + screen-radius cache first. Feeds
  // the pick-debug overlay (see ui/pick-debug.js) so we can eyeball
  // whether the picker's model matches what's actually drawn.
  function pickDebug() {
    updateScreen();
    return {
      count: liveCount,
      screen,
      radii: screenRadii,
      visible,
    };
  }

  return {
    mesh: points,
    material: mat,
    pickAt,
    pickDebug,
    setSelected,
    setHover,
    setLabelHover,
    setGlowFilter,
    positionOf,
    massOf,
    indexOfId,
    addBody,
    removeBody,
    updateBody,
    refreshAllKinds,
    refreshAllFolderTints,
    refreshAllDensities,
    setDensityBoost,
    moveBody,
    setPinned,
    isPinned: isPinnedById,
    markPositionsDirty,
    // Raw typed-array views. Physics and tethers mutate `position` directly
    // and call markPositionsDirty() to flag the upload to the GPU.
    buffers: {
      position: pos,
      velocity: vel,
      mass,
      kind,
      pinned,
      folderIdx,
    },
    // Folder ↔ index map for physics basins.
    folderCount() {
      return folderNameOf.length;
    },
    folderName(i) {
      return folderNameOf[i];
    },
    folderIndexOf,
    get capacity() {
      return capacity;
    },
    get count() {
      return liveCount;
    },
    noteIds,
    updateAccent(hex) {
      mat.uniforms.uAccent.value.set(hex);
    },
  };
}

function getAccent() {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue("--accent")
    .trim();
  return v || "#8ab4ff";
}
