---
mtime: 2025-09-10
---

# Electron future

Post-1.0 option. Wrap the web app in Electron so:

- Background tab throttling stops gating overnight dreams (the killer
  one — browsers choke background JS hard, so a dream in a tab the
  user isn't looking at runs at maybe 10% speed).
- File System Access becomes a real filesystem API, not a permission
  prompt.
- Distribution is a download, not a URL.

Cost: an 80 MB binary per platform, and the aesthetic starts feeling
like Everything You'd Expect™ instead of "a web app that's
surprisingly alive."

Probably we do it once and it stays optional. The web version keeps
working.

Related: [[Dream mode]], [[Scope creep]].

#idea
