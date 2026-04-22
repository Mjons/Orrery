// Spring physics between linked bodies.
//
// Runs on the CPU. Symplectic-Euler-ish: velocity is damped, then forces are
// applied, then position is integrated. This keeps settling stable even when
// the user creates large numbers of links at once.
//
// Forces:
//   - Spring per edge. Rest length ∝ log(mA*mB), so heavy anchors keep
//     their distance and light notes bunch closer.
//   - Lightweight pair repulsion between co-linked triangles only (cheap
//     replacement for a full O(n²) repulsive term — keeps linked clusters
//     from collapsing through each other).
//   - Isotropic drag, scaled by mass (heavier = slower to drift).
//
// The integrator is tuned to be dream-sensitive: when sleep depth is high,
// damping loosens and springs go softer. Phase 5 will wire that in; for
// Phase 3 a fixed "wake" profile is enough.

// Two regime profiles — wake (current-day physics) and dream (loose, fused,
// low-resolution). The active profile is a linear blend driven by the
// current sleep depth (0 = wake, 1 = deep dream). See DREAM.md §1 and
// DREAM_ENGINE.md §11.9 (visible choreography).
//
// Phase 1 ("drifting off") sits at depth roughly 0.1–0.3. At that depth
// the blend needs to produce a VISIBLE untethering — linked notes
// should start to drift apart, clusters should loosen, the universe
// should look noticeably different from wake. The DREAM profile below
// is intentionally aggressive so the untethering reads as a dream
// beginning, not as a physics subtle-drift.
// IMPORTANT convention (this cost us a debug session): `damping` here is
// a velocity MULTIPLIER per step. Every frame `v *= damping`. So
// HIGHER values mean LESS friction (velocity preserved longer), and
// LOWER values mean MORE friction. DREAM wants "loose" motion, which
// means HIGHER damping than wake, not lower.
const WAKE = {
  springK: 0.55,
  damping: 0.88,
  maxSpeed: 600,
  repulseK: 900,
  repulseRadius: 50,
  noise: 0,
};
const DREAM = {
  // Aggressive Phase 1 tuning (DREAM_ENGINE.md §11.9).
  springK: 0.04, // near-zero: tethers barely pull, notes drift free
  damping: 0.94, // HIGHER than wake — drift carries instead of dying
  maxSpeed: 1600,
  repulseK: 250,
  repulseRadius: 75,
  noise: 140, // strong wander force — now the drift actually builds up
};

function profileForDepth(d) {
  const clamped = Math.max(0, Math.min(1, d));
  // Early-accelerating curve so Phase 1 ("warming", depth 0 → 0.55)
  // produces a visible loosening rather than a linear subtle drift.
  // sqrt(0.3) = 0.548 — so at Phase 1 mid-depth every physics param
  // has already moved 55% of the way from WAKE to DREAM values.
  const t = Math.sqrt(clamped);
  return {
    springK: WAKE.springK + (DREAM.springK - WAKE.springK) * t,
    damping: WAKE.damping + (DREAM.damping - WAKE.damping) * t,
    maxSpeed: WAKE.maxSpeed + (DREAM.maxSpeed - WAKE.maxSpeed) * t,
    repulseK: WAKE.repulseK + (DREAM.repulseK - WAKE.repulseK) * t,
    repulseRadius:
      WAKE.repulseRadius + (DREAM.repulseRadius - WAKE.repulseRadius) * t,
    noise: WAKE.noise + (DREAM.noise - WAKE.noise) * t,
  };
}

export function createPhysics({
  bodies,
  vault,
  getPinnedIds,
  getFolderInfluence,
  getDreamDepth,
  // DREAM_GRAVITY.md — optional dream-attractor plumbing. When these
  // aren't supplied (tests, scene setups that don't use dream mode),
  // the attractor stays at rest with strength 0 and contributes no
  // force. Default values below so old callers still work.
  getDreamPhase, // () => 'warming'|'generating'|'playing'|'discerning'|null
  getDreamState, // () => 'wake'|'falling'|'dreaming'|'waking'
  getDreamGravity, // () => boolean — user can disable the attractor
  getDreamGravityStrength, // () => number — peak strength constant (Settings slider)
  // DREAM_THEMES.md Phase C — anchor the attractor on a specific
  // region when a theme is set. Returns null when no theme is
  // active or the theme is too small to be viable; otherwise
  // { centroid: [x,y,z], extent, size }.
  getThemeAnchor,
}) {
  const positions = bodies.buffers.position;
  const velocities = bodies.buffers.velocity;
  const masses = bodies.buffers.mass;
  const pinnedBuf = bodies.buffers.pinned;
  const folderIdxBuf = bodies.buffers.folderIdx;
  const force = new Float32Array(bodies.capacity * 3);

  // Per-folder centroid cache, recomputed on a timer rather than every step —
  // O(n) averaging adds up otherwise, and the target point barely moves
  // between frames. Buffer grows if the vault ever exceeds 128 top folders.
  let centroids = new Float32Array(128 * 3);
  let centroidSlots = 128;
  let centroidFolderCount = 0;
  let centroidAge = 0; // seconds since last recompute

  let edges = [];
  rebuildEdges();

  // DREAM_GRAVITY.md — invisible wandering attractor. Lissajous
  // wander on three different frequencies so the path doesn't
  // visibly repeat over a dream cycle (~4.9 min). Amplitude bounded
  // to keep it inside the visible universe.
  const attractor = {
    position: [0, 0, 0],
    strength: 0, // computed each step; sign = direction (neg = repel)
    radius: 900, // finite — past this bodies don't feel it
    softening: 60, // minimum distance in the denominator, prevents singularity
    t: 0, // wander clock (seconds)
    amp: 620,
  };

  function rebuildEdges() {
    const seen = new Map(); // undirected-key → edge record (for mutual detection)
    const out = [];
    if (!vault) return;
    // TETHER_DIRECTION.md Phase A — preserve forward-graph direction
    // on each edge so the renderer can tell source from target.
    // `a` is always the forward-graph SOURCE (vault.forward[a].has(b)).
    // When BOTH directions exist (A → B and B → A in forward), we
    // draw once and flag `mutual: true`; the renderer uses this to
    // suppress the directional gradient on symmetric links.
    for (const [srcId, targets] of vault.forward) {
      const i = bodies.indexOfId(srcId);
      if (i < 0) continue;
      for (const dstId of targets) {
        const j = bodies.indexOfId(dstId);
        if (j < 0) continue;
        const key = i < j ? `${i}:${j}` : `${j}:${i}`;
        const existing = seen.get(key);
        if (existing) {
          // We've already drawn this undirected edge from the other
          // direction's pass. Mark both perspectives as mutual.
          existing.mutual = true;
          continue;
        }
        const mi = Math.max(masses[i], 0.5);
        const mj = Math.max(masses[j], 0.5);
        const rest = 55 + Math.log(mi * mj + 1) * 34;
        // `a` is always the SOURCE, `b` always the TARGET. The
        // spring physics doesn't care about direction (force is
        // symmetric) but the tether renderer reads a → b for its
        // luminance gradient.
        const record = { a: i, b: j, rest, mutual: false };
        out.push(record);
        seen.set(key, record);
      }
    }
    edges = out;
  }

  // Update the rest length for every edge touching a given body — called
  // after a save that may have changed the note's mass.
  function refreshEdgesFor(noteId) {
    const i = bodies.indexOfId(noteId);
    if (i < 0) return;
    for (const e of edges) {
      if (e.a !== i && e.b !== i) continue;
      const mi = Math.max(masses[e.a], 0.5);
      const mj = Math.max(masses[e.b], 0.5);
      e.rest = 55 + Math.log(mi * mj + 1) * 34;
    }
  }

  function step(dt) {
    if (dt <= 0) return;
    const live = bodies.count;
    if (live === 0) return;
    // Cap the step so a dropped frame doesn't launch bodies to infinity.
    dt = Math.min(dt, 0.033);

    const depth = getDreamDepth ? getDreamDepth() : 0;
    const profile = depth <= 0 ? WAKE : profileForDepth(depth);

    // Zero forces.
    for (let i = 0; i < live * 3; i++) force[i] = 0;

    // Spring forces.
    for (const e of edges) {
      if (e.a >= live || e.b >= live) continue;
      const ai = e.a * 3;
      const bi = e.b * 3;
      const dx = positions[bi] - positions[ai];
      const dy = positions[bi + 1] - positions[ai + 1];
      const dz = positions[bi + 2] - positions[ai + 2];
      const d2 = dx * dx + dy * dy + dz * dz + 1e-4;
      const d = Math.sqrt(d2);
      const disp = d - e.rest;
      const f = (profile.springK * disp) / d;
      force[ai] += f * dx;
      force[ai + 1] += f * dy;
      force[ai + 2] += f * dz;
      force[bi] -= f * dx;
      force[bi + 1] -= f * dy;
      force[bi + 2] -= f * dz;
    }

    // Short-range repulsion: prevents two linked nodes from settling on top
    // of each other. We only check neighbours-of-neighbours via edges to
    // avoid O(n²). Cheap and surprisingly effective at this scale.
    const rRad = profile.repulseRadius;
    const rRad2 = rRad * rRad;
    for (const e of edges) {
      if (e.a >= live || e.b >= live) continue;
      repel(e.a, e.b, profile.repulseK, rRad2);
    }

    // Dream wander force. When sleep depth is nonzero, every non-pinned
    // body gets a small random push per frame. This is the "leashless
    // drifting" of DREAM_ENGINE.md §1 — slack tethers let bodies be
    // nudged by this noise into neighbourhoods they'd never reach at
    // wake. The noise is per-frame (not per-second) so it reads as
    // gentle Brownian jitter rather than sudden kicks.
    if (profile.noise > 0) {
      const nmag = profile.noise;
      for (let i = 0; i < live; i++) {
        if (pinnedBuf[i]) continue;
        const fi = i * 3;
        // Three uniform [-0.5, 0.5] samples per body. Cheap, correlated-
        // enough-across-axes for a diffuse wander. If we ever see clumpy
        // drift we can swap to box-muller for proper Gaussian noise.
        force[fi] += (Math.random() - 0.5) * nmag;
        force[fi + 1] += (Math.random() - 0.5) * nmag;
        force[fi + 2] += (Math.random() - 0.5) * nmag;
      }
    }

    // Folder basin: gentle pull toward each folder's centroid, strength set
    // by the user. Off by default (influence 0), so this loop is a no-op on
    // vaults whose user hasn't opted in.
    const influence = getFolderInfluence ? getFolderInfluence() : 0;
    if (influence > 0 && folderIdxBuf) {
      centroidAge += dt;
      if (centroidAge > 0.5) {
        recomputeCentroids(live);
        centroidAge = 0;
      }
      const basinStrength = influence * 36; // tuned so 1.0 = decisive basins
      for (let i = 0; i < live; i++) {
        const fi = folderIdxBuf[i];
        if (fi < 0 || fi >= centroidFolderCount) continue;
        const ai = i * 3;
        const ci = fi * 3;
        const dx = centroids[ci] - positions[ai];
        const dy = centroids[ci + 1] - positions[ai + 1];
        const dz = centroids[ci + 2] - positions[ai + 2];
        force[ai] += dx * basinStrength * 0.01;
        force[ai + 1] += dy * basinStrength * 0.01;
        force[ai + 2] += dz * basinStrength * 0.01;
      }
    }

    // DREAM_GRAVITY.md — dream attractor. Only active when depth > 0
    // and the user hasn't disabled it. Strength is phase-weighted so
    // it ramps in during warming, peaks during generating/playing,
    // flips to an exhale during discerning, decays during waking.
    if (depth > 0.01) {
      updateAttractor(dt, depth);
      if (attractor.strength !== 0) applyAttractorForce(live);
    } else if (attractor.strength !== 0) {
      // Wake: ensure no residual pull lingers in the force buffer.
      attractor.strength = 0;
    }

    // Integrate.
    const damp = profile.damping;
    const maxV = profile.maxSpeed;
    for (let i = 0; i < live; i++) {
      if (pinnedBuf[i]) {
        const vi = i * 3;
        velocities[vi] = velocities[vi + 1] = velocities[vi + 2] = 0;
        continue;
      }
      const m = Math.max(masses[i], 0.4);
      const vi = i * 3;
      const fi = i * 3;
      velocities[vi] = (velocities[vi] + (force[fi] / m) * dt) * damp;
      velocities[vi + 1] =
        (velocities[vi + 1] + (force[fi + 1] / m) * dt) * damp;
      velocities[vi + 2] =
        (velocities[vi + 2] + (force[fi + 2] / m) * dt) * damp;

      // Speed cap — keeps the physics from ever running away, even during
      // an impulse from a big Cmd+N burst.
      const sx = velocities[vi];
      const sy = velocities[vi + 1];
      const sz = velocities[vi + 2];
      const sp = Math.sqrt(sx * sx + sy * sy + sz * sz);
      if (sp > maxV) {
        const k = maxV / sp;
        velocities[vi] *= k;
        velocities[vi + 1] *= k;
        velocities[vi + 2] *= k;
      }

      positions[vi] += velocities[vi] * dt;
      positions[vi + 1] += velocities[vi + 1] * dt;
      positions[vi + 2] += velocities[vi + 2] * dt;
    }

    bodies.markPositionsDirty();
  }

  // Phase-weight table from DREAM_GRAVITY.md §"Phase coupling".
  // Negative weight = exhale (repulsive). Zero for outer states that
  // don't have a dream engine running. The weight is multiplied by
  // `depth` in updateAttractor so even peak-weight phases fade in
  // naturally as the user falls asleep.
  function phaseWeight(state, phase) {
    if (state === "wake" || state === "waking") return 0;
    if (state === "falling") return 0.3;
    if (state === "dreaming") {
      if (phase === "warming") return 0.6;
      if (phase === "generating") return 1.0;
      if (phase === "playing") return 1.0;
      if (phase === "discerning") return -0.5; // exhale — disperse before wake
    }
    return 0;
  }

  function updateAttractor(dt, depth) {
    const enabled = getDreamGravity ? getDreamGravity() !== false : true;
    if (!enabled) {
      attractor.strength = 0;
      return;
    }
    const state = getDreamState ? getDreamState() : "dreaming";
    const phase = getDreamPhase ? getDreamPhase() : null;
    const w = phaseWeight(state, phase);
    // Peak-strength constant is user-tunable via Settings → Dream →
    // Strength. Defaults to 2800; 0 effectively disables without
    // flipping the toggle. Sign carried through to allow the
    // discerning-phase exhale.
    const peak = getDreamGravityStrength ? getDreamGravityStrength() : 2800;
    attractor.strength = w * depth * peak;

    attractor.t += dt;
    const t = attractor.t;
    const anchor = getThemeAnchor ? getThemeAnchor() : null;
    if (anchor && anchor.centroid) {
      // DREAM_THEMES.md §3 — theme-anchored motion.
      const cx = anchor.centroid[0];
      const cy = anchor.centroid[1];
      const cz = anchor.centroid[2];
      // Amplitude keyed to theme extent: "tighter Lissajous inside
      // the theme cluster's shape." Floor at 80 so a tight theme
      // still has breathing room; 1.3× extent means the attractor
      // occasionally strays just past the theme's edge to pull in
      // neighbours.
      const amp = Math.max(80, anchor.extent * 1.3);
      if (phase === "warming") {
        // Pinned at centroid with a tiny jitter — visually a
        // "gathering" before the roaming starts.
        attractor.position[0] = cx + Math.sin(t * 0.5) * 15;
        attractor.position[1] = cy + Math.cos(t * 0.7) * 15;
        attractor.position[2] = cz + Math.sin(t * 0.3 + 1) * 15;
      } else {
        // Lissajous centered on the theme centroid, amplitude
        // scaled so motion stays inside the cluster.
        attractor.position[0] = cx + amp * Math.sin(t * 0.063);
        attractor.position[1] = cy + amp * 0.55 * Math.sin(t * 0.101 + 1.3);
        attractor.position[2] = cz + amp * Math.cos(t * 0.079 + 0.7);
      }
    } else {
      // Random / no theme — default full-box Lissajous.
      const A = attractor.amp;
      attractor.position[0] = A * Math.sin(t * 0.063);
      attractor.position[1] = A * 0.55 * Math.sin(t * 0.101 + 1.3);
      attractor.position[2] = A * Math.cos(t * 0.079 + 0.7);
    }
  }

  function applyAttractorForce(live) {
    const ax = attractor.position[0];
    const ay = attractor.position[1];
    const az = attractor.position[2];
    const R = attractor.radius;
    const R2 = R * R;
    const soft = attractor.softening;
    const s = attractor.strength;
    // Force profile: strong-near, zero-at-edge, with a small angular
    // injection perpendicular to the pull direction so bodies SWIRL
    // into the well instead of falling straight in. The pure inverse-
    // square formula the doc proposed is drowned out by dream-mode
    // wander noise at every reasonable strength — this shape gives
    // us a force magnitude of order 1/soft at the core that's
    // comparable to spring forces during dream.
    //   mag(d) = s * (1 - d/R) / (d + soft)   — per-unit direction
    //   angular kick = perpendicular rotation of direction (yz plane scaled)
    const ANGULAR = 0.35; // fraction of radial magnitude rotated 90° in xz
    for (let i = 0; i < live; i++) {
      if (pinnedBuf[i]) continue;
      const pi = i * 3;
      const dx = ax - positions[pi];
      const dy = ay - positions[pi + 1];
      const dz = az - positions[pi + 2];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > R2) continue; // finite radius — a local weather system
      const d = Math.sqrt(d2) + 1e-4;
      const t = 1 - d / R; // smooth cutoff at edge
      const mag = (s * t) / (d + soft);
      // Unit direction from body → attractor.
      const ux = dx / d;
      const uy = dy / d;
      const uz = dz / d;
      // Radial pull.
      force[pi] += mag * ux;
      force[pi + 1] += mag * uy;
      force[pi + 2] += mag * uz;
      // Tangential kick in the xz plane (rotation ≈ Y axis) so the
      // whole field visibly swirls at peak. Sign of `s` carries
      // through — exhale spins the other way.
      force[pi] += mag * ANGULAR * -uz;
      force[pi + 2] += mag * ANGULAR * ux;
    }
  }

  function recomputeCentroids(live) {
    const fc = bodies.folderCount ? bodies.folderCount() : 0;
    if (fc > centroidSlots) {
      const nextSlots = Math.max(fc, centroidSlots * 2);
      const next = new Float32Array(nextSlots * 3);
      next.set(centroids);
      centroids = next;
      centroidSlots = nextSlots;
    }
    const used = fc;
    const counts = new Int32Array(used);
    for (let k = 0; k < used * 3; k++) centroids[k] = 0;
    for (let i = 0; i < live; i++) {
      const fi = folderIdxBuf[i];
      if (fi < 0 || fi >= used) continue;
      const si = fi * 3;
      const pi = i * 3;
      centroids[si] += positions[pi];
      centroids[si + 1] += positions[pi + 1];
      centroids[si + 2] += positions[pi + 2];
      counts[fi]++;
    }
    for (let fi = 0; fi < used; fi++) {
      const c = counts[fi];
      if (c === 0) continue;
      const si = fi * 3;
      centroids[si] /= c;
      centroids[si + 1] /= c;
      centroids[si + 2] /= c;
    }
    centroidFolderCount = used;
  }

  function repel(a, b, strength, rRad2) {
    const ai = a * 3;
    const bi = b * 3;
    const dx = positions[bi] - positions[ai];
    const dy = positions[bi + 1] - positions[ai + 1];
    const dz = positions[bi + 2] - positions[ai + 2];
    const d2 = dx * dx + dy * dy + dz * dz + 1e-4;
    if (d2 > rRad2) return;
    const d = Math.sqrt(d2);
    const f = strength / d2 / d; // falls off as 1/r³, very local
    force[ai] -= f * dx;
    force[ai + 1] -= f * dy;
    force[ai + 2] -= f * dz;
    force[bi] += f * dx;
    force[bi + 1] += f * dy;
    force[bi + 2] += f * dz;
  }

  // Push two bodies toward each other briefly, used on link creation so the
  // settling is visible instead of a silent pulse through the buffer.
  function kickTogether(idA, idB, strength = 180) {
    const i = bodies.indexOfId(idA);
    const j = bodies.indexOfId(idB);
    if (i < 0 || j < 0) return;
    const ai = i * 3;
    const bi = j * 3;
    const dx = positions[bi] - positions[ai];
    const dy = positions[bi + 1] - positions[ai + 1];
    const dz = positions[bi + 2] - positions[ai + 2];
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1;
    const f = strength / d;
    if (!pinnedBuf[i]) {
      velocities[ai] += f * dx;
      velocities[ai + 1] += f * dy;
      velocities[ai + 2] += f * dz;
    }
    if (!pinnedBuf[j]) {
      velocities[bi] -= f * dx;
      velocities[bi + 1] -= f * dy;
      velocities[bi + 2] -= f * dz;
    }
  }

  function kickApart(idA, idB, strength = 120) {
    kickTogether(idA, idB, -strength);
  }

  function getEdges() {
    return edges;
  }

  return {
    step,
    rebuildEdges,
    refreshEdgesFor,
    kickTogether,
    kickApart,
    getEdges,
    // DREAM_GRAVITY.md — read-only snapshot of the attractor so
    // main.js can lerp the camera's orbit target toward it. `active`
    // is a quick gate: non-zero strength means the force is in play
    // this frame.
    getAttractor: () => ({
      position: attractor.position.slice(),
      strength: attractor.strength,
      active: Math.abs(attractor.strength) > 0.01,
    }),
  };
}
