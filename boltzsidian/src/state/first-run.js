// First-run state. Single source of truth for "where in the journey is
// this user?" — see docs/FIRST_RUN_FLOW.md for the act model and
// docs/FIRST_RUN_BUILD.md FR0 for the contract.
//
// Persisted: only the highest act the user has reached (monotonic).
// In-memory: per-session counters that decide when to fire nudges.
//
// Nothing else in the app should read or write
// `localStorage.boltzsidian.firstRun.*` directly — go through here.

const ACT_KEY = "boltzsidian.firstRun.actSeen.v1";

// Nudge thresholds. Tuned in one place so we can dial without grep.
export const GRADUATE_THRESHOLD = 5; // unique welcome stars opened
export const RETURNING_LINK_THRESHOLD = 50; // skip act 4 above this on first paint

const MIN_ACT = 1;
const MAX_ACT = 5;

// Session-only counters. Reset on reload by design — we want a session
// of engagement, not a lifetime tally.
const welcomeStarsOpened = new Set();
let userLinksThisSession = 0;

function readActRaw() {
  try {
    const raw = localStorage.getItem(ACT_KEY);
    if (!raw) return MIN_ACT;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < MIN_ACT || n > MAX_ACT) return MIN_ACT;
    return n;
  } catch {
    return MIN_ACT;
  }
}

function writeActRaw(n) {
  try {
    localStorage.setItem(ACT_KEY, String(n));
  } catch {
    // Quota / private mode. Silent — first-run polish degrades gracefully.
  }
}

export function getActSeen() {
  return readActRaw();
}

export function isStage(n) {
  return readActRaw() === n;
}

// Monotonic. Calling with a lower value is a no-op so async race
// conditions during setWorkspace can't regress the act.
export function markActReached(n) {
  if (!Number.isFinite(n) || n < MIN_ACT || n > MAX_ACT) return;
  const current = readActRaw();
  if (n <= current) return;
  writeActRaw(n);
}

export function recordWelcomeStarOpened(noteId) {
  if (noteId == null) return welcomeStarsOpened.size;
  welcomeStarsOpened.add(noteId);
  return welcomeStarsOpened.size;
}

export function getWelcomeStarsOpenedCount() {
  return welcomeStarsOpened.size;
}

export function recordUserLinkCreated() {
  userLinksThisSession += 1;
  return userLinksThisSession;
}

export function getUserLinkCount() {
  return userLinksThisSession;
}

export function resetFirstRun() {
  try {
    localStorage.removeItem(ACT_KEY);
  } catch {}
  welcomeStarsOpened.clear();
  userLinksThisSession = 0;
}
