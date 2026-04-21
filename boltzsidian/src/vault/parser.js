// Parse one markdown file into a note record.

import { ulid } from "ulid";
import { parseFrontmatter } from "./frontmatter.js";

const LINK_RE = /\[\[([^\]\|\n]+?)(?:\|[^\]\n]+)?\]\]/g;
const TAG_RE = /(?:^|[\s(])#([a-zA-Z][\w/-]*)/g;
const H1_RE = /^#\s+(.+)$/m;
const CODE_FENCE_RE = /```[\s\S]*?```/g;
const INLINE_CODE_RE = /`[^`]*`/g;

function stripCode(text) {
  return text.replace(CODE_FENCE_RE, "").replace(INLINE_CODE_RE, "");
}

// Parse a raw markdown string into the structural bits Boltzsidian cares
// about. Does NOT fabricate a ULID — the caller decides whether to mint one.
export function parseMarkdown(text, { fallbackName } = {}) {
  const { data: frontmatter, content } = parseFrontmatter(text);

  const h1 = content.match(H1_RE);
  const title =
    (h1 && h1[1].trim()) ||
    (fallbackName ? fallbackName.replace(/\.md$/i, "") : "untitled");

  const scan = stripCode(content);

  const tagSet = new Set();
  let m;
  while ((m = TAG_RE.exec(scan))) tagSet.add(m[1]);
  TAG_RE.lastIndex = 0;

  const links = [];
  while ((m = LINK_RE.exec(scan))) links.push(m[1].trim());
  LINK_RE.lastIndex = 0;

  const trimmed = content.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;

  return {
    frontmatter,
    title,
    body: content,
    tags: [...tagSet],
    links,
    words,
  };
}

export async function readNote(entry) {
  const file = await entry.handle.getFile();
  const text = await file.text();
  const parsed = parseMarkdown(text, { fallbackName: entry.name });

  const id = parsed.frontmatter.id || ulid();
  const daily = detectDaily(entry.path, entry.name);

  // Demo vaults ship with a frontmatter `mtime` to give their notes a
  // believable age spread at install time — otherwise every note would
  // share the same "just installed" timestamp and nothing would fall into
  // the protostar / halo / prune buckets. Real user notes use the real
  // file mtime.
  let mtime = file.lastModified;
  const fmMtime = parsed.frontmatter.mtime;
  if (fmMtime) {
    const parsedMtime = Date.parse(String(fmMtime));
    if (!isNaN(parsedMtime)) mtime = parsedMtime;
  }

  return {
    id,
    path: entry.path,
    name: entry.name,
    title: parsed.title,
    body: parsed.body,
    rawText: text,
    frontmatter: parsed.frontmatter,
    tags: parsed.tags,
    links: parsed.links,
    words: parsed.words,
    mtime,
    size: file.size,
    isDaily: daily.isDaily,
    dailyDate: daily.dailyDate,
  };
}

// Notes that live in a `daily/` folder AND are named YYYY-MM-DD.md are
// treated specially — they get placed on a parametric filament curve so
// the time axis is navigable as a gesture rather than a search.
const DAILY_NAME_RE = /^(\d{4})-(\d{2})-(\d{2})\.md$/i;

export function detectDaily(path, name) {
  const segments = path.split("/");
  const inDailyDir = segments.some((s) => s.toLowerCase() === "daily");
  if (!inDailyDir) return { isDaily: false, dailyDate: null };
  const m = name.match(DAILY_NAME_RE);
  if (!m) return { isDaily: false, dailyDate: null };
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const ts = Date.UTC(y, mo, d);
  if (isNaN(ts)) return { isDaily: false, dailyDate: null };
  return { isDaily: true, dailyDate: ts };
}
