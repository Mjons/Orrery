// Prune candidates.
//
// At wake, compute the set of notes that have been orphaned long enough
// that the system thinks they're candidates for review. Never deletes
// anything — the output is a JSON sidecar the user can act on (or ignore).
//
// Rules (tight on purpose; the acceptance bar is "never suggest pruning a
// note edited in the last 48 hours"):
//   - no incoming OR outgoing links
//   - last-edited ≥ 14 days ago
//   - not in an observer caption during the dream just finished
//   - path contains no `.universe/` or similar sidecar parts
//
// Writes to `.universe/prune-candidates.json` as an array of:
//   { id, title, path, mtime, reason }

const MIN_IDLE_DAYS = 14;
const PRUNE_FILE = "prune-candidates.json";
const UNIVERSE_DIR = ".universe";

export function computePruneCandidates(vault, { excludeIds = new Set() } = {}) {
  const now = Date.now();
  const cutoff = now - MIN_IDLE_DAYS * 24 * 60 * 60 * 1000;
  const out = [];
  for (const n of vault.notes) {
    if (excludeIds.has(n.id)) continue;
    if (n._isPhantom) continue;
    const inDeg = vault.backward.get(n.id)?.size || 0;
    const outDeg = vault.forward.get(n.id)?.size || 0;
    if (inDeg > 0 || outDeg > 0) continue;
    if (!n.mtime || n.mtime > cutoff) continue;
    const pathLower = (n.path || "").toLowerCase();
    if (pathLower.startsWith(".") || pathLower.includes("/.")) continue;
    out.push({
      id: n.id,
      title: n.title,
      path: n.path,
      mtime: n.mtime,
      reason: "no links in or out · untouched for " + humanDays(now - n.mtime),
    });
  }
  out.sort((a, b) => (a.mtime || 0) - (b.mtime || 0));
  return out;
}

function humanDays(ms) {
  const d = Math.floor(ms / (24 * 60 * 60 * 1000));
  if (d < 30) return `${d} days`;
  if (d < 90) return `${Math.round(d / 7)} weeks`;
  if (d < 365) return `${Math.round(d / 30)} months`;
  return `${Math.round(d / 365)} years`;
}

export async function writePruneCandidates(rootHandle, list) {
  try {
    const dir = await rootHandle.getDirectoryHandle(UNIVERSE_DIR, {
      create: true,
    });
    const fh = await dir.getFileHandle(PRUNE_FILE, { create: true });
    const w = await fh.createWritable();
    await w.write(
      JSON.stringify(
        {
          generatedAt: Date.now(),
          count: list.length,
          candidates: list,
        },
        null,
        2,
      ),
    );
    await w.close();
    return true;
  } catch (err) {
    console.warn("[bz] prune candidates write failed:", err);
    return false;
  }
}
