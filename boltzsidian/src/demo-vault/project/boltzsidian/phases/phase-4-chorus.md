---
mtime: 2026-04-01
---

# Phase 4 — observer chorus

3–5 days. Template-only utterances, ~40 hand-written sentences with
slots filled strictly from vault data. 5 Hz CPU nominator, cap 3
concurrent, rate-limited by a density setting. Rolling buffer of the
last 50 captions feeds the [[Morning report]].

Landed:

- Template library with slot-filtering (templates whose required
  slots aren't available are skipped).
- Seeded RNG per observer for reproducibility.
- Floating DOM captions with fade-in / fade-out; font size in
  settings.
- Settings toggle, density low/med/high, font slider.

Hard gate: if we reflexively turn the chorus off after a day, the
templates are wrong and we fix them. No LLM backend until the
template pass is already enjoyable ([[Anti-mysticism]]).

Related: [[Observer chorus]], [[Chorus becoming slop]].

#phase #done
