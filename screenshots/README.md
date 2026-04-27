# Screenshots

The eight hero stills, one per scene, that act as thumbnails for every
share, forever (per [docs/LAUNCH.md](../docs/LAUNCH.md) §1.3).

## What to put here

| filename               | scene        | notes                                  |
| ---------------------- | ------------ | -------------------------------------- |
| `01-filament.webp`     | Filament     | catch a long thread crossing the frame |
| `02-halo.webp`         | Halo         | full halo orbit visible                |
| `03-two-galaxies.webp` | Two Galaxies | mid-collision, tendrils visible        |
| `04-accretion.webp`    | Accretion    | jets emerging                          |
| `05-flock.webp`        | Flock        | a tight murmuration arc                |
| `06-cluster.webp`      | Cluster      | the bound core + drifting outskirts    |
| `07-dust.webp`         | Dust         | low-mass equilibrium, painterly        |
| `08-cinematic.webp`    | Cinematic    | the director mid-transition            |

## Specs

- 2560×1440
- WebP (smaller, sharper than PNG; GitHub renders it natively)
- No UI overlay — hide labels (`L`), close panels (`Esc`)
- Full-bleed canvas
- Pick the moment with the most painterly composition, not the most
  technical one. These are sales tools.

## How

1. Open `index.html` in Chrome/Edge.
2. Cycle to the scene with `s` or `1`–`8`.
3. Frame the shot — orbit and zoom until it looks like a Monet
   fragment, not a debug view.
4. Hide the UI: `L` for labels, `\` to close settings (Boltzsidian
   only), `?` to dismiss the hotkey overlay.
5. Press `e` to export the current frame.
6. Convert PNG → WebP at quality 90 (`cwebp -q 90` or any image tool).
7. Drop into this folder with the filename from the table.

## Auto-build (week 2+)

Per the launch plan, a GitHub Action will eventually re-shoot these
from headless Chrome on every merge so they don't go stale. Until that
ships, refresh by hand whenever a scene changes meaningfully.
