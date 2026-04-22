---
tended_on: [tag-infer]
id: 01KPS7VDAJC15HEWX41D0YHMBE
created: "2026-04-19T23:41:09.544Z"
---

# CENTER_VANISH.md — Why Centers of Mass Keep Disappearing

A deep-dive on all the reasons the galactic core / central black hole
seems to "vanish" while the user is watching, especially during a
follow-cam session. Confusing because the behaviour has **multiple
independent causes** that look identical on screen.

This is a diagnostic document, not a fix plan. Fixes go in the
relevant feature files (`STAR_TRAIL.md`, `FOLLOW_CAM.md`, per-scene
entries in `SCENES_CLUSTERS.md`).

---

## TL;DR

There isn't _one_ reason. There are **five**, and more than one can
fire in a single session. In rough order of "how often this is
actually what's happening":

1. **Follow-cam 90s timeout** (now fixed — was the loud bug).
2. **Camera geometry**: when you follow a star, the BH is almost
   always _behind_ the camera, not in front of it.
3. **Low-mass BH physically drifting** (Milky Way–specific — was
   mass 80, now 3200; fixed).
4. **BH close-encounter slingshot** (multi-BH scenes only — two
   heavy bodies approach, violate energy conservation at softening
   radius, fling apart at huge velocity).
5. **Scene transitions force-release the follow-cam** (intentional
   but feels like vanishing).

Categorising what's happening in a given observation is half the
battle. See the flowchart at the bottom.

---

## What "vanish" actually means on screen

The user sees one of four distinct visual phenomena, all of which
they describe as "vanishing":

- **A: Camera suddenly reframes.** The shot that had the BH centred
  cuts to a new framing where the BH is gone. Almost always caused by
  the follow-cam detaching (timeout, drag, scene change).
- **B: BH slowly drifts off screen.** Camera continues to follow a
  star; BH slowly creeps out of the frustum over 10–30 seconds.
  Physics drift OR orbital geometry.
- **C: Two BHs approach each other then fling apart.** They come
  visually close (often nearly touching on screen), then get
  accelerated outward at violent speed. Leaves the frame in <1s,
  often never comes back. The multi-BH-scene signature.
- **D: BH dims to invisible while still roughly in frame.** Rare —
  point size shrank below ~1 pixel, or the BH is in the far corner
  of an extreme-wide shot. Not what the user is usually seeing.

Each has a different root cause. Work through them in order.

---

## Cause 1 — the follow-cam timeout

**Status:** fixed in the current revision ([index.html:7134](index.html#L7134)).

The follow-cam had `maxAge: 90` which unconditionally called
`followCamRelease("timeout")` after 90 seconds. `followCamRelease`
does two things:

1. `pointMat.uniforms.uFollowUV.value.set(-1, -1)` — un-highlights the
   followed body.
2. `stopTrail()` — stops trail recording (the trail stays visible but
   doesn't grow).

What the user saw was phenomenon **A** (camera suddenly detaches) and
phenomenon **B** (the trail no longer extends, so the star appears to
"leave" its trail). Exactly what "release times out" and "center
vanishes" were describing.

**Fix that landed:** `maxAge: 86400` (24 hours — effectively none).
Scene transitions and user input still release normally.

**How to tell this was the cause:** a `Released timeout` toast would
flash briefly at the moment of vanishing. The toast is only ~1.5s,
easy to miss.

---

## Cause 2 — camera geometry when following a star

This is **inherent to the feature** and cannot be "fixed" without
reinventing what follow-cam means.

### The geometry

When follow-cam attaches to a body at position $P$:

- `controls.target.copy(P)` — camera looks AT the body
- `camera.position.copy(P).add(offset)` — camera sits at body + offset

where `offset` is a small vector (typically 20–50 units) in the
direction perpendicular-ish to the body's velocity.

Result: the camera's view direction is $-$offset (from camera
position toward target). The BH at origin lies at position $-P$
relative to the body — the **opposite direction from the camera**
most of the time.

Concretely, imagine following a star at $P = (200, 0, 0)$:

- Camera at, say, $(240, 20, 10)$ looking at $(200, 0, 0)$.
- Camera view direction: from $(240, 20, 10)$ toward $(200, 0, 0)$ =
  $(-40, -20, -10)$ roughly.
- BH at $(0, 0, 0)$ relative to camera: at $(-240, -20, -10)$. Along
  the view direction.
- **BH is 240 units past the target**, on the far side. Still in
  frame if FOV is wide enough and the BH is bright enough.

But when the star is on the OPPOSITE side of its orbit — $P = (-200,
0, 0)$ — the camera sits at $(-240, 20, 10)$ and BH is **behind the
camera**. Not in frame at all.

### Why it feels like "vanishing"

At the moment the user starts following, the orbit typically has the
star on the near side (where the BH _is_ in frame). Half an orbit
later, the star is on the far side (where the BH _isn't_). The BH
gradually slides out of the frustum over 30–60s.

### Why this is not a bug

The follow-cam's job is to follow the star. If we also tried to keep
the BH in frame, the camera would have to rotate around the star in a
way that no longer tracks it — it'd become a gimbal, not a chase-cam.

### Mitigations available (not yet built)

- **Two-subject follow mode**: camera positions itself so BOTH the
  followed body AND a secondary body (auto-detected as heaviest in
  scene) are in frame. Zoom out more, preserve composition.
- **Hint orbit**: render a thin world-space line from body to BH so
  the viewer always has a spatial reference, even when the BH is
  off-screen.
- **Background marker**: a small on-screen HUD arrow pointing toward
  the BH when it's off-screen. Breaks the "no UI chrome over the sim"
  aesthetic. Probably not worth it.

---

## Cause 3 — physics drift of a light-mass BH

**Status:** fixed in Milky Way specifically; other scenes were never
at risk.

### The mechanism

A body with mass $m$ experiencing force $F$ from a neighbour
accelerates at $a = F/m$. Under symplectic Euler, position drifts by
$\Delta x \approx (F/m) \cdot \Delta t^2 / 2$ per step.

If the BH has mass 80 and a nearby bulge star has mass 27, sitting at
$r = 5$, the force is roughly:

$$F = \frac{m_\text{star}}{r^2 + \varepsilon^2} \approx \frac{27}{31} \approx 0.87$$

BH acceleration: $0.87 / 80 \approx 0.011$ units/time².
Star acceleration: $0.87 / 27 \approx 0.032$ units/time².

In a 2-body encounter the **lighter** body gets pushed around. Over
many such encounters (hundreds per second in a dense bulge), the BH
accumulates a random walk. Expected displacement after N encounters
scales as $\sqrt{N}$. With softening=2.5 and a dense nucleus, the
Milky Way's mass-80 BH drifted visibly within 60 seconds.

### Which scenes are at risk

Checked mass values across all scenes ([index.html:3150](index.html#L3150)
and neighbourhood):

| Scene              | Central BH mass | Neighbouring star mass | Mass ratio | Drift risk |
| ------------------ | --------------: | ---------------------: | ---------: | ---------- |
| `sagittarius`      |          40,000 |                     ~2 |    20,000× | None       |
| `event-horizon`    |         140,000 |                   ~0.3 |   470,000× | None       |
| `orrery`           |           8,000 |                     ~1 |     8,000× | None       |
| `collision` (each) |          60,000 |                     ~2 |    30,000× | None       |
| `milky-way` (was)  |              80 |                    ~27 |         3× | **Huge**   |
| `milky-way` (now)  |           3,200 |                    ~27 |       120× | Minor      |
| `virgo-m87`        |          14,000 |                     ~4 |     3,500× | None       |
| `sombrero`         |          60,000 |                     ~1 |    60,000× | None       |

Rule of thumb: a central BH needs to be **at least 1,000× heavier**
than a typical neighbouring body to stay roughly stationary over a
10-minute session. Less than ~100× and it will drift visibly.

### Why the Milky Way BH was originally light

On purpose. Real Sgr A\* is 4 million solar masses — heavy, but the
central ~1 parsec contains ~10 million solar masses of stars. The
BH does _not_ dominate its local neighbourhood; stellar mass does.
I tried to capture this faithfully by setting BH mass = 80 (roughly
3× a single star). Physically accurate, dynamically unstable for
visualisation. A compromise at 3,200 is "heavier than everything
nearby combined but not heavy enough to make the rotation curve
unrealistic."

---

## Cause 4 — BH close-encounter slingshot

**This is what the user reported seeing most often.** Two BHs approach
each other, get very close on screen, then both get slammed outward at
huge velocity. They leave the frame in under a second, often never to
return. Looks exactly like "they vanished" — and they kind of did,
just at Mach-10 instead of zero.

Scenes at risk (any scene with ≥2 massive bodies whose orbits can
bring them close):

| Scene              | # heavy bodies | Mass each | Softening (was → now) | Peak risk       |
| ------------------ | -------------: | --------: | --------------------- | --------------- |
| `collision`        |              2 |    60,000 | 0.50 → **4.0**        | High → Low      |
| `stephans-quintet` |              5 |  ~various | 0.45 → **4.0**        | High → Low      |
| `bullet-cluster`   |              2 |   ~17,000 | 0.50 → **3.5**        | High → Low      |
| `virgo-m87`        |              1 |    14,000 | 0.30                  | None (1 BH)     |
| `sagittarius`      |              1 |    40,000 | 0.35                  | None (1 BH)     |
| `event-horizon`    |              1 |   140,000 | 0.12                  | None (1 BH)     |
| `milky-way`        |       1 (+259) |     3,200 | 2.50                  | None (1 anchor) |

Single-BH scenes can't slingshot — it takes two heavy bodies in close
proximity.

### The physics

Softened Newtonian gravity in the velocity shader:

$$\vec{F}_i = \sum_{j \neq i} G \, m_j \, \frac{\vec{r}_j - \vec{r}_i}{(|\vec{r}_j - \vec{r}_i|^2 + \varepsilon^2)^{3/2}}$$

When $|\vec{r}| \to 0$, the magnitude caps at $F_\text{max} = G m_j /
\varepsilon^3$. For the `collision` scene's pair of 60,000-mass BHs
with $\varepsilon = 0.35$:

$$F_\text{max} = \frac{1 \cdot 60{,}000}{0.35^3} \approx 1.4 \times 10^6 \text{ units/time}^2$$

Applied for one timestep of `dt = 0.012`:

$$\Delta v = 1.4 \times 10^6 \times 0.012 \approx 17{,}000 \text{ units/time}$$

That's a **17,000× jump in velocity** applied in one frame. Typical
orbital velocities in these scenes are 10–100 — so one close encounter
kicks both BHs to many orders of magnitude beyond escape velocity.
They fly apart because the integrator has given them enormous
unphysical energy.

### Why this happens

Symplectic Euler is **only** symplectic (energy-preserving on average)
when the timestep is much smaller than the orbital period at the
closest approach. At $r = \varepsilon$ the effective orbital period
for two masses $m_1, m_2$ is:

$$T_\text{orbit} \approx 2\pi \sqrt{\frac{\varepsilon^3}{G(m_1 + m_2)}}$$

For the collision scene's BH pair near $\varepsilon = 0.35$:

$$T_\text{orbit} \approx 2\pi \sqrt{\frac{0.043}{120{,}000}} \approx 0.0038 \text{ time units}$$

That's **0.3 of our `dt = 0.012`**. The integrator is stepping across
a third of an orbital period in one step — way outside the regime
where symplectic conservation holds. Energy accumulates
exponentially, and the pair escapes with enormous kinetic energy.

### Mitigations, in order of impact

1. **Raise softening dramatically in multi-BH scenes.** If
   `collision` used $\varepsilon = 5$ instead of 0.35, the orbital
   period at closest approach would be:

   $$T \approx 2\pi \sqrt{\frac{125}{120{,}000}} \approx 0.064 \text{ time units}$$

   ≈ 5× `dt`. Integrator stable. Two galaxy BHs could still pass
   close and deflect each other gracefully, as they should.

   Tradeoff: the cores of each galaxy get slightly "fluffier" — stars
   near the BH don't feel the full $1/r^2$ at close range. Visually
   barely noticeable.

2. **Pair-wise mass-scaled softening.** In the force shader, use:

   $$\varepsilon_{ij} = \max(\varepsilon, k \sqrt{m_i m_j})$$

   Lighter pairs see normal softening. Heavier pairs automatically
   get more. Only affects BH-BH pairs where it's needed; dust and
   stars keep their sharp interactions.

   Shader change: ~5 lines in the velocity compute shader. Physical,
   and self-tuning — no per-scene config needed.

3. **Adaptive substeps when peaks are detected.** Before each frame,
   scan for any body-pair within $N \times \varepsilon$. If found,
   bump `params.substeps` that frame. Negligible perf cost most of
   the time; rare frames do more work.

   More code, but the most principled fix.

4. **Initial conditions that avoid close passage.** `collision`'s
   scenarios already set the impact parameter deliberately — if
   the parameter becomes "head-on," the BHs **will** pass close.
   Can't really forbid this by construction; the user chose a
   head-on scenario.

5. **Accept it.** `collision` is specifically _about_ violent
   dynamics. A BH slingshot might read as dramatic emergence
   rather than a bug. Not a great answer, but worth noting that
   the sim **doesn't need to be physically pristine** — we just
   need the BH not to leave at Mach 100 and vanish forever.

Combination strategy: **land #2 as a permanent shader upgrade** (it's
right for _every_ scene and invisible to lighter-mass dynamics),
then raise individual scene softenings (#1) where slingshots still
happen. Keep #3 in back pocket if #1+#2 aren't enough.

### Quick tuning pass (no code change)

For the three at-risk scenes, changing `softening` in the scene's
`physics` block gets 80% of the benefit immediately:

```diff
  collision:
-   physics: { G: 1.0, softening: 0.35, dt: 0.012, speed: 1.0 },
+   physics: { G: 1.0, softening: 4.0,  dt: 0.012, speed: 1.0 },

  stephans-quintet:
-   physics: { G: 1.0, softening: 0.30, dt: 0.010, speed: 1.0 },
+   physics: { G: 1.0, softening: 4.0,  dt: 0.010, speed: 1.0 },

  bullet-cluster:
-   physics: { G: 1.0, softening: 0.28, dt: 0.010, speed: 1.0 },
+   physics: { G: 1.0, softening: 3.5,  dt: 0.010, speed: 1.0 },
```

This is ~15 minutes of tuning + testing. Easy win.

---

## Cause 5 — scene transitions release follow-cam

When `applyScene(key)` runs or when cinematic/movie mode transitions,
it implicitly drops any active follow-cam because:

1. The body index the follow-cam was attached to points into a
   different body (or empty slot) in the new scene.
2. The scene factory calls `zero()` which clears body state.
3. `clearTrails()` is called during transitions (see
   [index.html:4713](index.html#L4713), [index.html:4867](index.html#L4867)).

From the user's perspective: "I was following a nice orbit, cinematic
mode changed the scene, now the BH is gone." Technically correct
behaviour (new scene, new bodies, follow-cam stale), but the
transition is disorienting.

### Mitigation

- **Pause cinematic / movie mode while follow-cam is active.** Make
  user-initiated follow override auto-director. The director resumes
  when the user releases.
- **Persist the follow across scene transitions** only if the new
  scene has "the same" body (by position/kind match). Hard to
  implement cleanly; probably not worth it.

Recommended: the first one. Small UX rule, big clarity gain.

---

## A decision flowchart

Next time "the BH vanished" — walk through this:

```
BH vanished while following ─┐
                             │
             Did it happen in <1 second with the BH
             accelerating violently outward?
                         │
                   ┌─────┴─────┐
                  YES          NO
                   │           │
            ─► Cause 4       (continue)
               (slingshot)     │
                               │
             Did it happen suddenly (one frame)?
               │                               │
              YES                              NO
               │                               │
     ┌─────────┴─────────┐          It drifted over 10-60s.
     │                   │                     │
    Was there            Did the scene         ┌────────┴───────┐
   a "Released"          change (cinematic   Physics      Camera
     toast?              / movie mode)?        drift?      geometry?
     │                       │                 │             │
    YES ─► Cause 1        YES ─► Cause 5       │             │
       (follow-cam         (scene transition)  │             │
        timeout)                               │             │
                                               │             │
                                  Is this scene's BH         │
                                  < 100× heaviest star?      │
                                          │                  │
                                         YES ─► Cause 3      │
                                         (light BH drift)    │
                                          │                  │
                                         NO ─► Cause 2       │
                                           (orbital          │
                                            geometry)        │
```

---

## What this teaches us

The follow-cam + trail feature sits at the intersection of physics,
rendering, and UX. Every failure mode looks like the same bug but
has a different fix. The fix applied to each layer:

- Physics layer (stability): make BHs heavy enough not to drift
  (≥1,000× neighbour mass). `milky-way`-specific; other scenes OK.
- Physics layer (close encounters): raise softening in multi-BH
  scenes, or add pair-wise mass-scaled softening in the shader.
  _Not yet done._ The biggest open lever on perceived "vanishing."
- UX layer: remove the unconditional 90s timeout. _Done._
- Direction layer: pause cinematic/movie mode while user-initiated
  follow is active. _Not yet done._

Each of those is ~5–20 lines. Land them individually; each will make
the feature a little more trustworthy. None depend on the others.

---

## The follow-cam promise

"Attach to this star. Watch it orbit. The camera tracks it. The trail
draws its journey. The journey lasts as long as you want. Central
gravitational anchor stays visible when its geometry permits."

Four conditions; we've now satisfied two (duration + anchor
stability). Still leaves two half-broken (geometry limitations +
anchor size at distance), but those are harder problems with real
tradeoffs, and their "failures" are at least internally consistent.
Users can learn "the BH is behind me because I'm on the far side of
the orbit" in a way they cannot learn "the feature randomly gave up
after 90 seconds."

Ship the easy fixes. Live with the hard ones.

#star #user #risk
