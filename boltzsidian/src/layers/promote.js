// Promote pipeline — turning a surfaced idea into a real note on disk.
//
// Runs on user action from the ideas drawer. Writes an ideas/…md file,
// adds the note to the vault, spawns a body at the interaction midpoint,
// and flags the source candidate promoted. Discard and Ignore are handled
// by the drawer directly (they just mutate salience-layer state); only
// Promote touches disk, which is the Phase 6 design contract.

import { ulid } from "ulid";
import { createNoteAt, titleToStem, uniquePath } from "../vault/writer.js";
import { stringifyFrontmatter } from "../vault/frontmatter.js";
import { addNoteToVault } from "../vault/mutations.js";

const IDEAS_DIR = "ideas";

// Build the promoted-idea's in-memory note record + frontmatter + body,
// pick a unique filename, write it, add it to the vault, spawn a body at
// the midpoint, and flag the source candidate promoted. Returns the new
// note.
export async function promoteIdea({
  candidate,
  vault,
  bodies,
  saver, // optional — present to keep the save pipeline centralised; we
  // can also call createNoteAt directly. Current main wires saver.
  salienceLayer,
  physics,
  tethers,
}) {
  if (!candidate || !vault) return null;

  const now = new Date();
  const stem = promotedStem(candidate, now);
  const taken = new Set(vault.notes.map((n) => n.path));
  const path = uniquePath(IDEAS_DIR, stem, taken);

  const id = ulid();
  const title = pickPromotedTitle(candidate);
  const parentPaths = [candidate.parentA?.path, candidate.parentB?.path].filter(
    Boolean,
  );

  const frontmatter = {
    id,
    created: now.toISOString(),
    born_in_dream: true,
    parents: parentPaths,
    resonance: roundN(candidate.resonance, 4),
    salience: roundN(candidate.salience, 4),
    novelty: roundN(candidate.novelty, 4),
    coherence: roundN(candidate.coherence, 4),
    reach: roundN(candidate.reach, 4),
    affinity: candidate.affinity.map((f) => roundN(f, 4)),
    // MODEL_SURFACES.md §8.2 feedback-loop guard: any vault note
    // whose content came from a model backend is stamped so future
    // passes (tend, salience, dream) can down-weight it when they
    // otherwise would learn from it. "template" = deterministic floor,
    // everything else is generated text the user accepted.
    generated_by: candidate.seedBackend || "template",
    // Phase C resilience stamp — an idea that survived the adversarial
    // pass wears it. Absent when the candidate never had an adversary
    // run (template floor) or was itself a counter-replacement (in
    // which case survivedCritique is false by design).
    ...(candidate.survivedCritique === true ? { survived_critique: true } : {}),
  };

  // The body: structured content so the promoted file reads as a real
  // document rather than a one-sentence scribble. Sections only appear
  // when the corresponding field is populated — template-floor
  // candidates fall back to seedText as the sole "Claim" body.
  const aLink = candidate.parentA ? `[[${candidate.parentA.title}]]` : null;
  const bLink = candidate.parentB ? `[[${candidate.parentB.title}]]` : null;
  const lines = [];
  lines.push(`# ${title}`);
  lines.push("");
  lines.push("## Claim");
  lines.push(candidate.claim || candidate.seedText || "(empty)");
  lines.push("");
  const evidenceA = candidate.evidenceA;
  const evidenceB = candidate.evidenceB;
  if (evidenceA || evidenceB) {
    lines.push("## Evidence");
    if (evidenceA && candidate.parentA) {
      lines.push(`- From [[${candidate.parentA.title}]]: *"${evidenceA}"*`);
    }
    if (evidenceB && candidate.parentB) {
      lines.push(`- From [[${candidate.parentB.title}]]: *"${evidenceB}"*`);
    }
    lines.push("");
  }
  if (candidate.nextAction) {
    lines.push("## Next");
    lines.push(candidate.nextAction);
    lines.push("");
  }
  if (candidate.adversaryReason) {
    lines.push("## Adversary's read");
    lines.push(candidate.adversaryReason);
    lines.push("");
  }
  if (aLink && bLink) {
    lines.push(`Parents: ${aLink} · ${bLink}`);
  } else if (aLink) {
    lines.push(`Parent: ${aLink}`);
  }
  lines.push("");
  lines.push(
    `<sub>Born in a dream on ${now.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}. Keep, edit, or delete — this file was written by the app, not by you.</sub>`,
  );
  const body = lines.join("\n") + "\n";

  const rawText = stringifyFrontmatter(frontmatter, body);

  // Write to disk via the workspace handle. createNoteAt is idempotent on
  // a non-existent path; uniquePath above guaranteed freshness.
  await createNoteAt(vault.root, path, rawText);

  // Build the in-memory note record matching what readNote would have
  // produced if this file had been present at vault load.
  const note = {
    id,
    path,
    name: path.includes("/") ? path.slice(path.lastIndexOf("/") + 1) : path,
    title,
    body,
    rawText,
    frontmatter,
    tags: [],
    links: [candidate.parentA?.title, candidate.parentB?.title].filter(Boolean),
    words: body.trim().split(/\s+/).length,
    mtime: now.getTime(),
    size: rawText.length,
    kind: 0,
    affinity: candidate.affinity.slice(),
  };

  addNoteToVault(vault, note);

  // Spawn a body at the midpoint between the parents (or at origin if
  // neither parent has a position).
  const worldPos = candidate.midpoint || [0, 0, 0];
  bodies?.addBody?.(note, worldPos);

  // Re-parse forward/backward link graph now that a new note with two
  // outgoing wikilinks exists. The cheapest way to get the physics +
  // tethers up to date is to let them rebuild; they read vault.forward.
  if (physics) physics.rebuildEdges();
  if (tethers) tethers.rebuild();

  // Mark in the salience layer so the drawer no longer shows it as
  // surfaced.
  salienceLayer?.markPromoted?.(candidate.id);

  return note;
}

// Discard is a no-op on disk — just forget the candidate.
export function discardIdea({ candidate, salienceLayer }) {
  salienceLayer?.removeSurfaced?.(candidate.id);
}

// Ignore keeps it in the drawer but marks it seen. The drawer handles
// the "read vs unread" styling based on candidate.readAt.
export function ignoreIdea({ candidate }) {
  candidate.readAt = Date.now();
}

function promotedStem(candidate, now) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const slug = titleToStem(pickPromotedTitle(candidate));
  return `${y}-${m}-${d}-${hh}${mm}-${slug}`;
}

// Pick a title: the seed text itself if it's short enough, else a
// compressed "A ↔ B" form.
function pickPromotedTitle(candidate) {
  const t = candidate.seedText?.trim() || "";
  if (t && t.length <= 80) return t.replace(/\.$/, "");
  const a = candidate.parentA?.title || "A";
  const b = candidate.parentB?.title || "B";
  return `${a} ↔ ${b}`;
}

function roundN(v, n) {
  if (!Number.isFinite(v)) return 0;
  const k = Math.pow(10, n);
  return Math.round(v * k) / k;
}
