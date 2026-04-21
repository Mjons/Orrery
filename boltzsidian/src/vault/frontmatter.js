// Minimal YAML-ish frontmatter parser. Handles only the subset Boltzsidian
// writes itself: string scalars, booleans, numbers, inline arrays, null.
// Anything more complex returns the raw string for that field.
//
// Intentionally no dependency on `gray-matter` — that package ships a
// Buffer-dependent build and pulls a chunky js-yaml. Our schema is tiny.

export function parseFrontmatter(text) {
  if (!text.startsWith("---")) return { data: {}, content: text };
  // first line after opening `---` must be a newline
  const afterOpen = text.indexOf("\n", 3);
  if (afterOpen === -1) return { data: {}, content: text };
  const close = text.indexOf("\n---", afterOpen);
  if (close === -1) return { data: {}, content: text };
  const yaml = text.slice(afterOpen + 1, close);
  // content starts after `\n---\n`
  let rest = text.slice(close + 4);
  if (rest.startsWith("\r")) rest = rest.slice(1);
  if (rest.startsWith("\n")) rest = rest.slice(1);
  return { data: parseYaml(yaml), content: rest };
}

function parseYaml(src) {
  const data = {};
  for (const raw of src.split("\n")) {
    const line = raw.replace(/\r$/, "");
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    if (!key) continue;
    const value = line.slice(colon + 1).trim();
    data[key] = parseScalar(value);
  }
  return data;
}

function parseScalar(s) {
  if (s === "" || s === "null" || s === "~") return null;
  if (s === "true") return true;
  if (s === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (s.startsWith("[") && s.endsWith("]")) {
    const inner = s.slice(1, -1).trim();
    if (!inner) return [];
    return splitCsv(inner).map((x) => parseScalar(x.trim()));
  }
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    return s.slice(1, -1);
  }
  return s;
}

function splitCsv(s) {
  const out = [];
  let depth = 0;
  let start = 0;
  let quote = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") depth--;
    else if (c === "," && depth === 0) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out;
}

// Stringify for write-back (Phase 2). Kept minimal and deterministic so we
// don't churn files on every save.
export function stringifyFrontmatter(data, body) {
  const keys = Object.keys(data);
  if (keys.length === 0) return body;
  const lines = ["---"];
  for (const k of keys) lines.push(`${k}: ${stringifyScalar(data[k])}`);
  lines.push("---");
  return lines.join("\n") + "\n" + body;
}

function stringifyScalar(v) {
  if (v === null || v === undefined) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) return `[${v.map(stringifyScalar).join(", ")}]`;
  const s = String(v);
  // quote if contains characters that would confuse our parser
  if (/[:#\[\]"']/.test(s) || s !== s.trim()) return JSON.stringify(s);
  return s;
}
