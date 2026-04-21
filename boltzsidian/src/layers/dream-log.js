// Dream log writer — produces `.universe/dreams/YYYY-MM-DD.md`.
//
// Tone rules (DREAM.md §7): flat. No mysticism. No "the universe whispers."
// The log is a record of what happened, not a narrative about what it means.
// Captions are listed chronologically; events read like timestamps from a
// process log; pruning is a dry list.
//
// Multiple dreams in one day append as separate sections under the same file.

const UNIVERSE_DIR = ".universe";
const DREAMS_SUBDIR = "dreams";

export async function writeDreamLog(rootHandle, artifacts) {
  if (!rootHandle || !artifacts) return null;
  const stamp = new Date(artifacts.endedAt);
  const yyyy = stamp.getFullYear();
  const mm = String(stamp.getMonth() + 1).padStart(2, "0");
  const dd = String(stamp.getDate()).padStart(2, "0");
  const fileName = `${yyyy}-${mm}-${dd}.md`;
  const path = `${UNIVERSE_DIR}/${DREAMS_SUBDIR}/${fileName}`;

  try {
    const dir = await getOrCreateDir(rootHandle, [UNIVERSE_DIR, DREAMS_SUBDIR]);
    const fh = await dir.getFileHandle(fileName, { create: true });
    const existing = await readIfExists(fh);
    const block = renderBlock(artifacts);
    const next = existing
      ? existing.replace(/\s+$/, "") + "\n\n---\n\n" + block
      : `# Dreams — ${yyyy}-${mm}-${dd}\n\n` + block;
    const w = await fh.createWritable();
    await w.write(next);
    await w.close();
    return path;
  } catch (err) {
    console.warn("[bz] dream log write failed:", err);
    return null;
  }
}

async function getOrCreateDir(root, segments) {
  let dir = root;
  for (const s of segments) {
    dir = await dir.getDirectoryHandle(s, { create: true });
  }
  return dir;
}

async function readIfExists(fileHandle) {
  try {
    const f = await fileHandle.getFile();
    const text = await f.text();
    return text || "";
  } catch {
    return "";
  }
}

function renderBlock(art) {
  const start = fmtTime(art.startedAt);
  const end = fmtTime(art.endedAt);
  const dur = fmtDuration(art.durationMs);
  const peak = art.peakDepth.toFixed(2);
  const caps = art.captions || [];
  const prune = art.pruneCandidates || [];
  const events = art.events || [];

  const lines = [];
  lines.push(`## Dream · ${start} → ${end}`);
  lines.push("");
  lines.push(`- duration: ${dur}`);
  lines.push(`- peak depth: ${peak}`);
  lines.push(`- captions: ${caps.length}`);
  lines.push(`- prune candidates: ${prune.length}`);
  lines.push("");

  if (caps.length) {
    lines.push("### Captions");
    lines.push("");
    for (const c of caps) {
      lines.push(`- ${fmtTime(c.at)} — ${escapeBacktick(c.text)}`);
    }
    lines.push("");
  }

  if (prune.length) {
    lines.push("### Prune candidates");
    lines.push(
      "",
      "Suggestions only. Nothing in `.universe/` ever deletes your notes.",
      "",
    );
    for (const p of prune.slice(0, 10)) {
      lines.push(`- \`${p.path}\` — ${p.reason}`);
    }
    if (prune.length > 10)
      lines.push(
        `- …and ${prune.length - 10} more — see prune-candidates.json`,
      );
    lines.push("");
  }

  if (events.length) {
    lines.push("### Events");
    lines.push("");
    for (const e of events) {
      const d =
        typeof e.depth === "number" ? ` (depth ${e.depth.toFixed(2)})` : "";
      lines.push(`- ${fmtTime(e.at)} ${e.label}${d}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function fmtTime(ms) {
  const d = new Date(ms);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

function fmtDuration(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function escapeBacktick(s) {
  return String(s).replace(/`/g, "ˋ");
}

// Path the morning report can pass to "Load full dream" → opens the note.
export function dreamLogPathFor(endedAt = Date.now()) {
  const stamp = new Date(endedAt);
  const yyyy = stamp.getFullYear();
  const mm = String(stamp.getMonth() + 1).padStart(2, "0");
  const dd = String(stamp.getDate()).padStart(2, "0");
  return `${UNIVERSE_DIR}/${DREAMS_SUBDIR}/${yyyy}-${mm}-${dd}.md`;
}
