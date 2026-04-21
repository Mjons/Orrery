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

export async function readNote(entry) {
  const file = await entry.handle.getFile();
  const text = await file.text();
  const { data: frontmatter, content } = parseFrontmatter(text);

  const h1 = content.match(H1_RE);
  const title = (h1 && h1[1].trim()) || entry.name.replace(/\.md$/i, "");

  const id = frontmatter.id || ulid();
  const scan = stripCode(content);

  const tags = new Set();
  let m;
  while ((m = TAG_RE.exec(scan))) tags.add(m[1]);
  TAG_RE.lastIndex = 0;

  const links = [];
  while ((m = LINK_RE.exec(scan))) links.push(m[1].trim());
  LINK_RE.lastIndex = 0;

  const trimmed = content.trim();
  const words = trimmed ? trimmed.split(/\s+/).length : 0;

  return {
    id,
    path: entry.path,
    name: entry.name,
    title,
    body: content,
    rawText: text,
    frontmatter,
    tags: [...tags],
    links,
    words,
    mtime: file.lastModified,
    size: file.size,
  };
}
