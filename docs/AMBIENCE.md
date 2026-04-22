# AMBIENCE.md — Cluster auras and the feel of the universe

A speculative design doc. Michael's observation, captured from a demo
vault screenshot showing two tight note-clusters joined by a filament
of tethers:

> I see our 2 clusters in our demo. But I want to see an aura glow
> around them which defines their cluster. The more they cluster
> together, the stronger the bloom / aura gets. The ambience settings
> should be similar to our original galaxy simulator.

Right observation. What the render currently shows is geometry —
points and lines. What it's missing is _atmosphere_. The clusters are
_there_, but they're implied, not expressed. This doc is how to express
them.

Two things are tangled in the ask: **cluster auras** (a halo that
traces density) and **ambience presets** (the post-processing stack
lifted from the sim). They belong in the same doc because they share
one truth: the universe's beauty is load-bearing. Tune it here or the
whole product reads as a file-browser pretending to be a galaxy.

---

## 0. The current render, diagnosed

What's on screen right now:

- Bodies (`THREE.Points` with per-kind tint) — good.
- Tethers (line segments between linked bodies) — good.
- A starfield backdrop and existing bloom pass — good.
- **No signal for "this group of notes is its own thing."**

A cluster in the current render is "the area where the dots are closer
together." The human visual system does spot it — your screenshot
proves it — but it's not an expressed property of the universe. If you
close your eyes and describe the image, you say _"two bright knots with
lines between them."_ What we want you to say: _"two glowing galaxies,
joined by a bridge."_

The difference is one rendering pass and one detection step.

---

## 1. Detecting clusters

Before we can glow a cluster, we have to know what a cluster is. Three
candidate signals, in order of honesty:

### 1.1 Link-graph community detection (primary)

Run a community-detection pass over the resolved link graph at layout
time. **Label propagation** is the simplest algorithm that produces
good results and runs in O(n) for sparse graphs; Louvain and Leiden are
more sophisticated but rarely needed below 10,000 notes.

Output: a cluster id per note. Clusters are stable across sessions as
long as the graph is.

```
vault.clusters = {
  byId:   Map<clusterId, { noteIds, centroid, extent }>
  ofNote: Map<noteId, clusterId>
}
```

### 1.2 Spatial density peak (fallback)

For notes with zero links — the halo notes — community detection
places them alone. A secondary pass groups them by proximity:
k-nearest-neighbor merges within a radius threshold. Prevents the
"spray of solo fireflies" look.

### 1.3 Folder identity (override)

If the user has set `folder_influence > 0`, folder membership takes
precedence. Clusters that don't align with folders get suppressed —
the user has declared folders as the authoritative grouping, and the
aura should honor that.

### 1.4 When to recompute

- After the initial layout lands (once).
- After every K structural changes (new note, deleted link, rename).
  Batched; debounced by ~2 seconds.
- After a dream. Dream physics reshuffles positions but not links —
  graph clusters stay stable, but spatial density peaks may shift.
  Re-run only the spatial part.

Detection cost for 1000 notes: ~30ms. Budget: ≤100ms at any vault
size we care about in 1.0.

---

## 2. Rendering the aura, three stacked techniques

The whole stack is optional. Each technique on its own looks decent;
all three together is what makes it feel like an atmosphere.

### 2.1 Density-aware body emission (free)

Give each body a local density factor and multiply it into the body's
emission. The existing `UnrealBloomPass` picks up the extra brightness
and produces a collective halo _for free_ over dense regions.

```glsl
// in bodies vertex shader
float densityBoost = 1.0 + aLocalDensity * 0.6;  // 0..2.2 typical
vSelfGlow = baseSelfGlow * densityBoost;
```

`aLocalDensity` is written at layout time — count of bodies within a
radius, normalized. It's a per-body attribute, static until the graph
changes. Costs one float per body. Makes tight clusters visibly
luminous without a single new rendering pass.

_This alone is probably 60% of what Michael described._ Start here.

### 2.2 Per-cluster halo sprite

For each detected cluster, place a single soft-edged billboard at the
cluster's centroid, sized proportional to its extent. Additive blended,
low alpha, camera-facing. Tinted by the cluster's dominant
folder-aura if folder tints are set, else the accent.

```
halo.size   = max(2.5 * cluster.extent, 40)
halo.alpha  = 0.18 + 0.25 * min(1, cluster.density / REF)
halo.tint   = cluster.folderTint || accent
halo.blur   = radial gaussian; softest possible edge
```

Max ~40 halos. Negligible cost. Gives the cluster a _boundary_ the eye
locks onto — the thing you're missing when you look at the current
render.

### 2.3 Accumulation pass for bridges (advanced)

The screenshot's most interesting detail is the filament _between_ the
two clusters. A bridge of tethers carrying light from one to the other.
To express that: render a low-resolution "radiance accumulator" texture
where each body deposits a soft gaussian into its screen-space neighbors
(cheap post-pass), then add it back at low opacity. This highlights not
just clusters but the corridors between them.

More expensive. Defer until §2.1 and §2.2 ship.

### 2.4 What all three give you together

- Dense regions glow internally (§2.1).
- Each cluster has a visible soft boundary (§2.2).
- Bridges between clusters light up as you'd expect (§2.3).

Cumulative render cost at 1000 bodies + 15 clusters: negligible. None
of these touches CPU frame time; it's all fragments.

---

## 3. The aura responds to density dynamically

Michael's phrase — _"the more they cluster together, the stronger the
bloom"_ — is the operating principle. All three techniques above
already respect it:

- §2.1: `aLocalDensity` is literally neighbor-count.
- §2.2: `cluster.density` drives halo alpha.
- §2.3: bridge brightness scales with endpoint density.

This matters in dream mode specifically (§8). As dream physics shoves
notes around, density changes frame by frame. The aura moves with it.
Two clusters merging visibly brighten as their halos overlap and fuse.
A cluster dispersing visibly fades. **This is the most important
visual story dream mode can tell,** and the aura system is how we tell
it.

---

## 4. Ambience presets — lifting the sim's lens

The original sim has a whole post-processing stack the user could dial:
bloom (threshold, strength, radius), chromatic aberration, vignette,
grain, palette. Boltzsidian quietly inherited all of this at build-time
because we share the renderer, but none of it is _exposed_.

Bring it forward with a single **Ambience** selector in settings.

### 4.1 Named presets

Five presets to start — each a direct lift or blend from the sim's
scene presets:

- **Default.** Balanced bloom, light vignette, no grain, no CA. What
  ships. Safe for long reading sessions.
- **Galactic.** Wide bloom, deep vignette, subtle CA. Like the sim's
  galaxy-collision scene. Best for browsing at full-vault overview.
- **Clinical.** Tight bloom, no CA, no grain, crisp shadows. Like a
  physics-lab lens. Best for focused reading of a single note with the
  panel open.
- **Dream.** Overcranked bloom, heavier CA, grain up, palette shift
  toward cool. Used automatically at depth > 0.3 (dream mode); can be
  picked manually for "always-dreamy" users.
- **Vintage.** Warm palette, analog grain, soft vignette. Cozy. Good
  for a journal-heavy vault.

One dropdown, five options. Preset names are what users learn; they
don't see the numeric parameters unless they want to.

### 4.2 Advanced sliders (behind a reveal)

For the user who cares, a disclosure triangle under Ambience exposes
seven sliders — bloom threshold, bloom strength, bloom radius, CA
amount, vignette strength, grain intensity, palette temperature.

Advanced values are saved as a _custom preset_ the user names ("My
Evening"). Custom presets live at the top of the dropdown alongside the
five built-ins.

### 4.3 Composition with Sleep Depth

Sleep Depth (DREAM.md) already interpolates physics parameters between
wake and a dream regime. Ambience joins the interpolation: at depth
0.0, Default; at depth 1.0, Dream. Intermediate depths cross-fade bloom
strength + CA + palette temperature. A soft nightfall every time the
universe drifts into a dream.

This is the piece that makes the transitions feel like states of mind
and not parameter tables.

---

## 5. One knob, two sides

Boltzsidian has one visual-identity slider most users never touch:
**the accent color**. Ambience presets should _never override it_ —
they layer over it, shifting temperature, bloom, and grain while the
accent stays the user's own. A Vintage ambience with a blue accent
still feels blue; a Dream ambience with an orange accent still feels
orange. The accent is identity; ambience is weather.

If a future preset _does_ need a temperature shift strong enough to
fight the accent, that preset is wrong. Ambience is lighting, not
repainting.

---

## 6. How this composes with what's already built

| Existing concept                | Ambience interaction                                               |
| ------------------------------- | ------------------------------------------------------------------ |
| Accent color                    | Untouched. Ambience is lighting over identity.                     |
| Kind tint                       | Unchanged. Body core colors still read.                            |
| Folder aura (FORMATIONS §1.1)   | Cluster halo picks up folder tint when folder_tints are set.       |
| Galactic core (FORMATIONS §4.2) | Reuse the cluster detection for its highlight.                     |
| Solo folder                     | Non-solo cluster halos dim to match.                               |
| Sleep Depth (DREAM §1)          | Drives ambience preset interpolation.                              |
| Dream scenes                    | Each dream scene can declare a recommended ambience override.      |
| Formations rail                 | Active formations dim non-matching cluster halos, not remove them. |

Nothing above is a breaking change. It all layers on what exists.

---

## 7. What this is NOT

The negative-space section. These are tempting but out of scope:

- **Per-note animated pulses timed to something.** Resist. Beautiful
  for a demo, annoying for reading. (Subtle breathing tied to sleep
  depth is fine — at depth > 0.2 only.)
- **Cluster-level nameplates floating in-scene.** Labels belong to
  notes, not clusters. Cluster names live in the stats readout if the
  user hovers the halo (Phase 3.9 maybe), not as perma-text.
- **Rainbow per-cluster colors.** One accent, one palette. Clusters
  differentiate by halo _size and density_, not by deviating hues.
- **Volumetric fog that fills the whole scene.** Expensive, and it
  drowns the notes. We want atmosphere between clusters, not a soup.

---

## 8. Why this is the most important dream-mode story

Dream mode (DREAM.md) cranks physics. Bodies move. Existing visual
signals in wake mode all fade: links stretch and blur, tethers fade
for clarity, labels retract. What's left?

**Clusters reforming and dispersing.** That's the dream.

Without an aura system, all you see is dots moving. With one, you see:

- Two clusters slowly drifting toward each other.
- Their halos start to overlap.
- The density between them rises; the bridge lights up.
- A smaller new cluster detaches from the edge of one.
- A moment later its halo condenses and it becomes its own thing.

That's a visible thought forming. That's the reason dream mode exists
as a feature and not just a parameter regime. **The aura is how dream
mode speaks.**

---

## 9. Minimal first cut

Order things so §2.1 alone is shippable and already answers 60% of the
original ask.

### 9.1 First sprint (3–5 days)

1. Layout-time community detection (label propagation). Stable cluster
   ids attached to notes. Store in `vault.clusters`.
2. Per-body `aLocalDensity` attribute, written once at layout time.
3. Shader patch: body emission multiplied by `(1 + aLocalDensity * k)`.
4. Ambience preset dropdown in settings: Default / Galactic / Clinical.
   Sleep-depth interpolation between current preset and Dream preset.

After this sprint, the screenshot's two clusters will visibly glow
from the inside. No new render passes, no new sprites.

### 9.2 Second sprint (3–4 days)

5. Cluster halo sprites — one billboard per cluster at centroid, size
   from extent, alpha from density. Additive, depth-write false.
6. Folder-tint integration: halo picks up the cluster's dominant
   folder aura if set.
7. Dream preset + Vintage preset added to ambience selector.
8. Custom preset save-as for advanced users.

After this sprint, the clusters have a visible boundary, and users can
pick an ambience that suits their vibe.

### 9.3 Deferred

- Bridge accumulation pass (§2.3). Lovely but expensive; ship when
  we've had dream mode running on a real vault and can tell whether
  it's missed.
- Custom preset UI beyond save-as.
- Cluster-level interaction (hover a halo to see cluster stats,
  click to frame-zoom). Probably lands with formations Phase 3.7.

---

## 10. Phase fit

Two honest options for where this lands in [BUILD_PLAN.md](BUILD_PLAN.md):

- **Extend Phase 3.7.** Add the ambience/cluster-aura work to the
  Formations phase. Total phase scope becomes ~2 weeks instead of 1,
  but the user-facing visual payoff (folder auras + cluster auras + a
  preset selector) arrives in one coherent release.
- **New Phase 3.9.** Keep 3.7 focused on folders/formations, slot
  Ambience as its own phase between 3.7 and 4 (Chorus). Clean
  separation; smaller exit gates.

I'd lean toward **extending 3.7** — the folder aura and cluster aura
share ~80% of their shader work, and splitting them would cost a day
of integration rework. But if the phase-gate discipline matters more
than the calendar, 3.9 is the cleaner path.

Ask at the end, not here.

---

## 11. One sentence

The universe has always had clusters; until now it's just never
admitted they were there.
