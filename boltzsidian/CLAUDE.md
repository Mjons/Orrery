# CLAUDE.md — Boltzsidian branch

Orientation for sessions working inside `boltzsidian/` on the `boltzsidian`
branch.

## What this is

Boltzsidian. A local-first markdown note-taking app whose workspace is a
GPU-accelerated particle universe. Forked from the sim on branch
`boltzsidian` of the Universe_sim_4_7 repo.

Canonical planning docs live at branch root:

- [WORKSPACE.md](../docs/WORKSPACE.md) — product spec
- [BUILD_PLAN.md](../docs/BUILD_PLAN.md) — operational phases 0-7
- [BRAIN.md](../docs/BRAIN.md), [BOLTZMANN.md](../docs/BOLTZMANN.md),
  [OBSIDIAN.md](../docs/OBSIDIAN.md), [DREAM.md](../docs/DREAM.md) — speculative
  layers that become features

## Invariants (these deliberately differ from the sim's root CLAUDE.md)

- **Bundler: Vite.** Yes, this breaks the sim's single-file-HTML rule.
  CodeMirror 6 and the overall scope make it necessary. Do not "restore"
  the single-file invariant on this branch.
- **npm + package.json.** Dependencies are versioned.
- **Plain JavaScript.** No TypeScript. (Same as sim — this stays.)
- **WebGL2 only.** Same as sim.
- **MIT licensed, open source.**
- **Single-user.** No collaboration hooks in the data model.
- **User's notes never leave their machine** except on explicit opt-in
  Claude API utterance path (Phase 7), which always shows exactly what it
  sends.
- **One accent color.** `--accent: #8ab4ff` by default. Do not introduce a
  second accent. Aesthetic parity with the sim at every phase.

## File map

```
boltzsidian/
├── package.json
├── vite.config.js
├── index.html       app shell with HUD
├── CLAUDE.md        this file
├── LICENSE
├── README.md
├── .gitignore
├── public/
│   └── demo-vault/  (curated content ships in Phase 3.5)
└── src/
    ├── main.js      entry + boot
    ├── sim/         renderer, scene, physics
    ├── vault/       FS Access, parsing, index, persistence
    ├── editor/      CodeMirror 6 integration (Phase 2)
    ├── ui/          panels, HUD, search strip, settings
    ├── layers/      chorus, dream, meaning (Phases 4-6)
    └── state/       settings, runtime state, persistence
```

## Common tasks

See [../docs/BUILD_PLAN.md](../docs/BUILD_PLAN.md) for phase-by-phase deliverables
with acceptance criteria and exit gates. Every phase has a kill condition.
Do not skip gates.

## Shared code with the sim

Shaders, palette arrays, and K presets live at repo root (in
`../index.html`) and will be extracted to shared modules when the sim
actually needs changes. For Phase 0 the starfield is ported inline —
re-share when the first real sim change lands on `main`. Keep the port
small; don't fork the whole sim into `boltzsidian/`.

## Performance budgets

See [../docs/BUILD_PLAN.md](../docs/BUILD_PLAN.md) §4.7. Re-measure at every phase
gate.

## User preferences (author: Michael)

- Terse, actionable. No preamble.
- Windows 11, Chrome / Edge. RTX 4090.
- Aesthetic parity with the sim at every phase. Glass. Bloom. One accent.
- Never TypeScript. Never over-engineer.
- When in doubt about whether a feature feels right, leave a minimal hook
  and ship the phase.
