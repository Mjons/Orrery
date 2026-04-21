---
mtime: 2025-12-08
---

# Stability API

Backs [[AI panel layout]]. We don't call it for pixels — the
panel-layout model is a small layout-specific LLM we host ourselves
— but we do call Stability for reference sketches when a user asks
for "a rough of what this panel could look like."

Cost model: every AI call is metered. Free tier gets N layout calls
per day, zero pixel calls. Pro gets unlimited layouts and metered
pixels.

Trap we keep watching: cost-per-user blowing out if someone uses the
reference feature as a generation tool. Hard daily cap per account.

Related: [[Stability API cost]], [[Pro tier]].

#stack-ph #ai
