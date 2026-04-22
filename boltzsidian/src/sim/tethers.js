// Tethers — one line segment per link in the graph.
//
// The segment list tracks every edge from physics plus ghost entries for
// edges that were just deleted, so they can fade out rather than pop. Each
// segment has a current alpha that eases toward its target; when a ghost
// reaches ~0 it's dropped from the list.
//
// Picking is done in screen space — we project both endpoints and measure
// pointer-to-segment distance. Cheaper than a bvh and precise enough for
// right-click delete.

import * as THREE from "three";

const TMP = new THREE.Vector3();
const FADE_IN_RATE = 5.0;
const FADE_OUT_RATE = 3.0;
const ALPHA_BASE = 0.55;
const MAX_SEGMENTS = 8000;

export function createTethers({
  scene,
  bodies,
  physics,
  camera,
  getAccent,
  getDreamDepth, // Phase 1 untethering — tether alpha fades with depth
}) {
  const positions = new Float32Array(MAX_SEGMENTS * 2 * 3);
  const alphas = new Float32Array(MAX_SEGMENTS * 2);
  const distances = new Float32Array(MAX_SEGMENTS * 2);
  // TETHER_DIRECTION.md Phase B — per-vertex direction t (0 at
  // source, 1 at target) and per-segment mutual flag (same value
  // at both vertices). Fragment shader mixes source/target
  // brightness along `aDirT`; mutual edges short-circuit to a
  // uniform brightness so A↔B reads as symmetry.
  const dirT = new Float32Array(MAX_SEGMENTS * 2);
  const mutualFlag = new Float32Array(MAX_SEGMENTS * 2);

  const geom = new THREE.BufferGeometry();
  geom.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage),
  );
  geom.setAttribute(
    "aAlpha",
    new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage),
  );
  geom.setAttribute(
    "aDist",
    new THREE.BufferAttribute(distances, 1).setUsage(THREE.DynamicDrawUsage),
  );
  geom.setAttribute(
    "aDirT",
    new THREE.BufferAttribute(dirT, 1).setUsage(THREE.StaticDrawUsage),
  );
  geom.setAttribute(
    "aMutual",
    new THREE.BufferAttribute(mutualFlag, 1).setUsage(THREE.DynamicDrawUsage),
  );

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uAccent: { value: new THREE.Color(getAccent ? getAccent() : "#8ab4ff") },
      uTime: { value: 0 },
      // uDepth drives Phase 1 untethering. At depth 0 (wake) this has
      // no effect. At depth 1 (deep dream) tether alpha is reduced to
      // ~45% of wake. At the Phase 1 band (depth ~0.3) tethers sit at
      // ~83% — visibly slackened, still readable.
      uDepth: { value: 0 },
      // TETHER_DIRECTION.md Phase B — brightness multipliers on the
      // accent color. Same hue, different luminance, so direction
      // is readable without introducing a second palette. uMutual
      // is the middle value — A↔B looks uniformly bright.
      uSourceScale: { value: 1.15 },
      uTargetScale: { value: 0.5 },
      uMutualScale: { value: 1.0 },
      // Phase-D quality gate: Low tier sets this to 0 and the
      // fragment collapses to a uniform uAccent. 1 = gradient on.
      uDirectional: { value: 1 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aAlpha;
      attribute float aDist;
      attribute float aDirT;
      attribute float aMutual;
      varying float vAlpha;
      varying float vDist;
      varying float vT;
      varying float vMutual;
      void main() {
        vAlpha = aAlpha;
        vDist = aDist;
        vT = aDirT;
        vMutual = aMutual;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uAccent;
      uniform float uTime;
      uniform float uDepth;
      uniform float uSourceScale;
      uniform float uTargetScale;
      uniform float uMutualScale;
      uniform float uDirectional;
      varying float vAlpha;
      varying float vDist;
      varying float vT;
      varying float vMutual;
      void main() {
        // Taper at the ends so endpoints don't look like they sprout blobs.
        float taper = 1.0 - abs(vDist - 0.5) * 1.5;
        taper = clamp(taper, 0.25, 1.0);
        // Slow pulse so static graphs feel alive but don't distract.
        float pulse = 0.88 + 0.12 * sin(uTime * 0.5 + vDist * 3.14);
        // Dream fade — tethers should nearly vanish during deep dream
        // so the user sees the "leashless" state the design intends.
        float dreamFade = max(0.05, 1.0 - sqrt(uDepth) * 1.1);

        // Directional brightness. One-way edges interpolate source →
        // target luminance along vT. Mutual edges stay at a uniform
        // mid-bright scale. Low quality tier (uDirectional == 0)
        // collapses everything to uAccent × 1.0.
        float directional = mix(uSourceScale, uTargetScale, vT);
        float k = mix(directional, uMutualScale, vMutual);
        k = mix(1.0, k, uDirectional);
        vec3 col = uAccent * k;

        gl_FragColor = vec4(col, vAlpha * ${ALPHA_BASE.toFixed(2)} * taper * pulse * dreamFade);
      }
    `,
  });

  const line = new THREE.LineSegments(geom, mat);
  line.frustumCulled = false;
  scene.add(line);

  // Each segment tracks: which two body indices, current alpha, target alpha.
  // `target = 1` for live edges, `target = 0` for ghost-fading edges.
  let segments = [];
  rebuild();

  function rebuild() {
    const edges = physics.getEdges();
    const liveKeys = new Set();
    for (const e of edges) liveKeys.add(edgeKey(e.a, e.b));

    const byKey = new Map();
    for (const s of segments) byKey.set(edgeKey(s.a, s.b), s);

    const next = [];
    for (const e of edges) {
      if (next.length >= MAX_SEGMENTS) break;
      const key = edgeKey(e.a, e.b);
      const existing = byKey.get(key);
      next.push({
        a: e.a, // forward-graph source (physics Phase A metadata)
        b: e.b, // forward-graph target
        alpha: existing ? existing.alpha : 0,
        target: 1,
        mutual: !!e.mutual,
      });
      byKey.delete(key);
    }
    // Anything left in byKey was removed — let it fade out.
    for (const ghost of byKey.values()) {
      if (next.length >= MAX_SEGMENTS) break;
      ghost.target = 0;
      next.push(ghost);
    }
    segments = next;
  }

  // Per-frame update: lerp alphas, stream vertex buffer.
  // Hovered segment (set via setHover) gets a multiplicative alpha bump so
  // the user can see which tether right-click would delete.
  let hoverKey = null;
  function update(dt, time) {
    if (mat.uniforms.uTime) mat.uniforms.uTime.value = time;
    if (mat.uniforms.uDepth) {
      const depth = getDreamDepth ? getDreamDepth() : 0;
      mat.uniforms.uDepth.value = Math.max(0, Math.min(1, depth));
    }
    const pos = bodies.buffers.position;
    let write = 0;
    const dtIn = Math.min(dt * FADE_IN_RATE, 1);
    const dtOut = Math.min(dt * FADE_OUT_RATE, 1);
    for (let i = 0; i < segments.length; i++) {
      const s = segments[i];
      const rate = s.target > s.alpha ? dtIn : dtOut;
      s.alpha += (s.target - s.alpha) * rate;
      if (s.target === 0 && s.alpha < 0.02) continue; // drop this frame

      const a = s.a * 3;
      const b = s.b * 3;
      const off = write * 6;
      positions[off + 0] = pos[a];
      positions[off + 1] = pos[a + 1];
      positions[off + 2] = pos[a + 2];
      positions[off + 3] = pos[b];
      positions[off + 4] = pos[b + 1];
      positions[off + 5] = pos[b + 2];
      const isHovered = hoverKey && edgeKey(s.a, s.b) === hoverKey;
      const aOut = Math.min(1, s.alpha * (isHovered ? 2.4 : 1));
      alphas[write * 2] = aOut;
      alphas[write * 2 + 1] = aOut;
      distances[write * 2] = 0;
      distances[write * 2 + 1] = 1;
      // TETHER_DIRECTION.md Phase B — first vertex = source end
      // (t = 0, brighter), second vertex = target end (t = 1,
      // dimmer). Both vertices of a segment share aMutual so the
      // shader can branch per-segment, not per-pixel.
      dirT[write * 2] = 0;
      dirT[write * 2 + 1] = 1;
      const m = s.mutual ? 1 : 0;
      mutualFlag[write * 2] = m;
      mutualFlag[write * 2 + 1] = m;
      segments[write] = s;
      write++;
    }
    segments.length = write;
    geom.setDrawRange(0, write * 2);
    geom.getAttribute("position").needsUpdate = true;
    geom.getAttribute("aAlpha").needsUpdate = true;
    geom.getAttribute("aDist").needsUpdate = true;
    geom.getAttribute("aDirT").needsUpdate = true;
    geom.getAttribute("aMutual").needsUpdate = true;
  }

  // Screen-space pick. Returns the segment whose 2D projection is closest
  // to the pointer, within a tolerance.
  function pickAt(clientX, clientY, tolerancePx = 10) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pos = bodies.buffers.position;
    let best = null;
    let bestD = tolerancePx;
    for (const s of segments) {
      if (s.alpha < 0.25) continue;
      TMP.set(pos[s.a * 3], pos[s.a * 3 + 1], pos[s.a * 3 + 2]).project(camera);
      if (TMP.z >= 1) continue;
      const ax = (TMP.x * 0.5 + 0.5) * w;
      const ay = (1 - (TMP.y * 0.5 + 0.5)) * h;
      TMP.set(pos[s.b * 3], pos[s.b * 3 + 1], pos[s.b * 3 + 2]).project(camera);
      if (TMP.z >= 1) continue;
      const bx = (TMP.x * 0.5 + 0.5) * w;
      const by = (1 - (TMP.y * 0.5 + 0.5)) * h;
      const d = pointSegDist(clientX, clientY, ax, ay, bx, by);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    if (!best) return null;
    return {
      aId: bodies.noteIds[best.a],
      bId: bodies.noteIds[best.b],
    };
  }

  function updateAccent(hex) {
    mat.uniforms.uAccent.value.set(hex);
  }

  function edgeKey(a, b) {
    return a < b ? `${a}:${b}` : `${b}:${a}`;
  }

  function setHover(hit) {
    // `hit` is either null (clear) or the { aId, bId } object returned by
    // pickAt. We translate to body indices and form the same edgeKey the
    // segments use so the per-frame compare is cheap.
    if (!hit) {
      hoverKey = null;
      return;
    }
    const a = bodies.indexOfId(hit.aId);
    const b = bodies.indexOfId(hit.bId);
    if (a < 0 || b < 0) {
      hoverKey = null;
      return;
    }
    hoverKey = edgeKey(a, b);
  }

  // RENDER_QUALITY.md + TETHER_DIRECTION.md §2.3 — Low tier drops
  // the directional gradient in exchange for a single uniform
  // color. Saves the mix + branch in the fragment shader on every
  // tether pixel. All other tiers keep the gradient on.
  function setQuality(tier) {
    const directional = (tier?.tetherMaxScale ?? 1) >= 0.5 ? 1 : 0;
    mat.uniforms.uDirectional.value = directional;
  }

  return {
    rebuild,
    update,
    pickAt,
    setHover,
    updateAccent,
    setQuality,
    material: mat,
    line,
  };
}

function pointSegDist(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const len2 = abx * abx + aby * aby + 1e-6;
  let t = (apx * abx + apy * aby) / len2;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const qx = ax + abx * t;
  const qy = ay + aby * t;
  const dx = px - qx;
  const dy = py - qy;
  return Math.sqrt(dx * dx + dy * dy);
}
