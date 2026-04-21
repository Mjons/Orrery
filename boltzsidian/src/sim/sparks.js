// Sparks — brief glowing pulses at the midpoint between two bodies when
// they bump during a dream cycle. One spark per pair-candidate spawn
// (DREAM_ENGINE.md §11.9 Phase 2 "dreaming loudly"). Each spark is a
// single point that grows + fades over ~900 ms and then recycles its
// slot.
//
// Rendering: THREE.Points with a fixed-size ring buffer. Additive
// blending and a radial falloff in the fragment shader so the spark
// reads as a soft light pulse rather than a hard dot. No texture —
// the shader draws everything procedurally.
//
// Slot recycling: a small ring buffer (256 slots) indexed by a
// monotonic counter. When the counter wraps, old sparks get
// overwritten — a new pulse in the same slot resets its life. This
// caps the GPU cost even during a burst of dozens of simultaneous
// spawns and eliminates any array-grow allocation.

import * as THREE from "three";

const MAX_SPARKS = 256;
const LIFETIME_S = 0.9;
// Two-spark model (DREAM_ENGINE.md §11.9 Q1). Small sparks fire at
// queue push — physics noticed two notes drifted close. Bright sparks
// fire at model completion — a candidate idea landed. Scale is applied
// in the vertex shader via a per-spark attribute.
export const SIZE_CONNECTION = 0.55;
export const SIZE_IDEA = 1.25;
// Rate gating — DREAM_ENGINE.md §11.9 wants sparks to feel like "a
// chance" event per proximity, not a deterministic pulse. Combination
// of probability (not every emit attempt fires) and a minimum gap
// (prevents bursty visual noise during dense generation) gives the
// field a sparse twinkle character.
const EMIT_PROBABILITY = 0.35;
const MIN_GAP_MS = 600;

export function createSparks({ scene, renderer, getAccent }) {
  const positions = new Float32Array(MAX_SPARKS * 3);
  // Remaining life in [0, 1]. Dead sparks sit at 0 and the shader
  // discards them — no need to shrink the draw range between frames.
  const lives = new Float32Array(MAX_SPARKS);
  // Per-spark size multiplier. Set at emit time; read by the vertex
  // shader to scale gl_PointSize. Default 1.0 = the old behaviour.
  const sizes = new Float32Array(MAX_SPARKS);
  sizes.fill(1.0);

  const geom = new THREE.BufferGeometry();
  geom.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage),
  );
  geom.setAttribute(
    "aLife",
    new THREE.BufferAttribute(lives, 1).setUsage(THREE.DynamicDrawUsage),
  );
  geom.setAttribute(
    "aSize",
    new THREE.BufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage),
  );
  // We always draw the full capacity — individual dead sparks self-
  // discard in the fragment shader when life <= 0. Keeps the draw call
  // count constant regardless of how many sparks are live.
  geom.setDrawRange(0, MAX_SPARKS);

  const pixelRatio =
    renderer?.getPixelRatio?.() ?? window.devicePixelRatio ?? 1;

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uAccent: {
        value: new THREE.Color(getAccent ? getAccent() : "#8ab4ff"),
      },
      uPixelRatio: { value: pixelRatio },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aLife;
      attribute float aSize;
      varying float vLife;
      varying float vSize;
      uniform float uPixelRatio;
      void main() {
        vLife = aLife;
        vSize = aSize;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        // Spark expands slightly as it fades, like a ripple hitting
        // the edge of a pond. baseSize tuned so the spark is bigger
        // than a body but still clearly local to its midpoint.
        float base = 30.0 * aSize * (1.0 + (1.0 - aLife) * 0.7);
        gl_PointSize = base * uPixelRatio * (360.0 / max(1.0, -mv.z));
        gl_Position = projectionMatrix * mv;
        if (aLife <= 0.0) gl_PointSize = 0.0;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uAccent;
      varying float vLife;
      varying float vSize;
      void main() {
        if (vLife <= 0.0) discard;
        vec2 p = gl_PointCoord - 0.5;
        float d = length(p);
        if (d > 0.5) discard;
        // Soft radial falloff + outer glow ring. The ring intensity
        // dips as life fades, so the spark "implodes" into a fading
        // centre rather than just dimming uniformly.
        float core = exp(-d * 7.0);
        float ring = smoothstep(0.32, 0.4, d) * (1.0 - d * 2.0);
        float fade = pow(vLife, 1.3);
        // Bigger sparks (idea-lands) also read brighter — boost alpha
        // with size so the two spark kinds are visually distinct
        // beyond pure radius.
        float alpha = (core + ring * 0.6) * fade * clamp(vSize, 0.4, 1.6);
        gl_FragColor = vec4(uAccent, alpha);
      }
    `,
  });

  const points = new THREE.Points(geom, mat);
  points.frustumCulled = false;
  // Render after bodies/tethers so sparks always land on top visually.
  points.renderOrder = 10;
  scene.add(points);

  // Ring-buffer state. `nextSlot` is the monotonic write cursor modulo
  // MAX_SPARKS. `active` tracks which slots currently have life > 0
  // so update() doesn't have to scan the full capacity every frame.
  let nextSlot = 0;
  const active = new Set();
  // Most-recent successful emit timestamp. Used by the rate gate so a
  // burst of candidate spawns doesn't visually machine-gun the field.
  let lastEmitMs = -Infinity;

  function emit(x, y, z, { force = false, size = 1.0 } = {}) {
    // Rate gate — both conditions must pass for a spark to fire, unless
    // the caller explicitly asks (diagnostic paths, first-spark on a
    // pair reinforcement). The probability gate is what gives the
    // "chance" feel; the time gap prevents visual stampedes.
    if (!force) {
      const nowMs = performance.now();
      if (nowMs - lastEmitMs < MIN_GAP_MS) return false;
      if (Math.random() > EMIT_PROBABILITY) return false;
      lastEmitMs = nowMs;
    }

    const slot = nextSlot;
    nextSlot = (nextSlot + 1) % MAX_SPARKS;

    const i = slot * 3;
    positions[i] = x;
    positions[i + 1] = y;
    positions[i + 2] = z;
    lives[slot] = 1.0;
    sizes[slot] = size;

    active.add(slot);
    geom.getAttribute("position").needsUpdate = true;
    geom.getAttribute("aLife").needsUpdate = true;
    geom.getAttribute("aSize").needsUpdate = true;
    return true;
  }

  function update(dt) {
    if (active.size === 0) return;
    const decay = dt / LIFETIME_S;
    let changed = false;
    for (const slot of active) {
      const next = lives[slot] - decay;
      if (next <= 0) {
        lives[slot] = 0;
        active.delete(slot);
      } else {
        lives[slot] = next;
      }
      changed = true;
    }
    if (changed) geom.getAttribute("aLife").needsUpdate = true;
  }

  function updateAccent(hex) {
    mat.uniforms.uAccent.value.set(hex);
  }

  function dispose() {
    scene.remove(points);
    geom.dispose();
    mat.dispose();
  }

  return {
    emit,
    update,
    updateAccent,
    dispose,
    count: () => active.size,
    capacity: () => MAX_SPARKS,
  };
}
