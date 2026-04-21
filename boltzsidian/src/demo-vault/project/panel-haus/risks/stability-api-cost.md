---
mtime: 2026-01-24
---

# Stability API cost

Outside of payroll, [[Stability API]] is the biggest variable cost.
A heavy Pro user could consume $4–6 of pixel compute a month at
current rates. At 500 Pro users that's a fine margin. At 50,000 it's
a different conversation.

Mitigations already in place:

- Hard daily caps per account (free + pro).
- Separate metering per call type — layout calls are near-free, pixel
  calls are the expensive ones.
- Queue at our end so we can rate-limit if a vendor issue spikes cost.

Re-evaluate margins quarterly. If we ever need to, self-host a smaller
open-source image model — cheaper per call, worse quality, probably
fine for "reference sketch" use.

Related: [[Pro tier]], [[Stability API]].

#risk-ph
