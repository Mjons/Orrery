// Claude utterance backend — user-supplied API key to the Anthropic API.
//
// Every request shape (job kind) requires per-session user approval.
// The first chorus line this session prompts a payload-preview modal
// showing the exact bytes that will be sent; approving caches approval
// for that job kind for the rest of the session. New job kind → new
// preview. New session → new approval.
//
// Key storage: IndexedDB entry keyed per-vault. Keys never leave the
// machine. No cross-vault sharing. The more elaborate
// Credential-Management-API-with-IndexedDB-encrypted-fallback path
// discussed in BUILD_PLAN §D7.4 is post-Phase-7 hardening; the Phase 7
// floor is plaintext-in-IndexedDB gated behind a user-entered key.
//
// Rate limits (client-side): soft cap of 30 requests per rolling
// minute. At the cap, further calls throw and the router falls back
// to template.

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 96;
const RATE_LIMIT_PER_MINUTE = 30;
const API_ENDPOINT = "https://api.anthropic.com/v1/messages";
const KEY_STORE_DB = "boltzsidian-keys";
const KEY_STORE_OBJSTORE = "keys";
const KEY_STORE_ID = "claude";

const SYSTEM_PROMPT = [
  "You are the observer voice of a personal note-taking app.",
  "Write exactly one short sentence (≤ 16 words) about the primary note.",
  "Use only the slot values provided. Never invent titles, tags,",
  "neighbours, dates, or other vault content. Tone: observational,",
  "quiet, anti-mystical. No prescriptions, no aphorisms.",
].join(" ");

export function createClaudeBackend({ getSettings } = {}) {
  let apiKey = null;
  let keyLoaded = false;
  let enabled = false;
  const callLog = []; // timestamps of recent calls for rate-limit window
  // Per-session approvals keyed by a canonical request-shape fingerprint.
  // Session-scoped on purpose — closing the tab wipes approvals.
  const approvedShapes = new Set();

  // Pluggable previewer. Registered by main.js during boot so the
  // backend doesn't have to know about DOM. Function signature:
  //   (preview) => Promise<boolean>   // true = user approved
  let previewer = null;

  function setPreviewer(fn) {
    previewer = typeof fn === "function" ? fn : null;
  }

  async function ensureKey() {
    if (keyLoaded) return apiKey;
    try {
      apiKey = await loadKeyFromIndexedDB();
    } catch {
      apiKey = null;
    }
    keyLoaded = true;
    return apiKey;
  }

  async function setApiKey(next) {
    apiKey = next || null;
    keyLoaded = true;
    if (apiKey) {
      await writeKeyToIndexedDB(apiKey);
    } else {
      await deleteKeyFromIndexedDB();
    }
  }

  async function getApiKey() {
    return ensureKey();
  }

  function setEnabled(on) {
    enabled = !!on;
  }

  function available() {
    if (!enabled) return false;
    if (!keyLoaded) return false; // don't claim availability until we've looked
    return !!apiKey;
  }

  async function ready() {
    await ensureKey();
    return available();
  }

  function overRateLimit() {
    const cutoff = Date.now() - 60_000;
    while (callLog.length && callLog[0] < cutoff) callLog.shift();
    return callLog.length >= RATE_LIMIT_PER_MINUTE;
  }

  async function generate({ snapshot } = {}) {
    if (!enabled) throw new Error("claude: disabled in settings");
    await ensureKey();
    if (!apiKey) throw new Error("claude: no API key configured");
    if (overRateLimit()) {
      throw new Error("claude: client-side rate limit (30/min) hit");
    }

    const userPrompt = buildPrompt(snapshot || {});
    const body = {
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    };

    // Payload preview — only runs the first time we see a given request
    // shape this session. Shape fingerprint excludes the user's actual
    // slot values so the preview isn't spammy — but the preview itself
    // DOES include full values, because we're trying to build trust,
    // not mask what's being sent.
    const shape = fingerprintRequestShape(body);
    if (!approvedShapes.has(shape)) {
      if (!previewer) {
        throw new Error(
          "claude: no payload-preview handler registered — refusing to send",
        );
      }
      const approved = await previewer({
        endpoint: API_ENDPOINT,
        model: MODEL,
        headers: redactedHeaders(apiKey),
        body,
        note: "First request of this shape this session. Approving caches approval until you close the tab.",
      });
      if (!approved) {
        throw new Error("claude: user declined payload preview");
      }
      approvedShapes.add(shape);
    }

    callLog.push(Date.now());
    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`claude: ${response.status} ${text.slice(0, 200)}`);
    }
    const json = await response.json();
    const text = extractText(json);
    if (!text) throw new Error("claude: empty completion");
    return {
      text,
      confidence: 0.9,
      backend: "claude",
      templateId: null,
    };
  }

  function cost() {
    return {
      latencyMs: 700,
      tokensOut: MAX_TOKENS,
      network: true,
      offline: false,
      pricingHint: "Anthropic pay-per-token",
    };
  }

  function clearApprovals() {
    approvedShapes.clear();
  }

  return {
    id: "claude",
    available,
    ready,
    generate,
    cost,
    setEnabled,
    setApiKey,
    getApiKey,
    setPreviewer,
    clearApprovals,
  };
}

// ── Prompt building ──────────────────────────────────────
function buildPrompt(snapshot) {
  const parts = [];
  if (snapshot.title) parts.push(`title: "${snapshot.title}"`);
  if (snapshot.neighbor) parts.push(`neighbour: "${snapshot.neighbor}"`);
  if (snapshot.tag) parts.push(`tag: #${snapshot.tag}`);
  if (snapshot.folder) parts.push(`folder: ${snapshot.folder}`);
  if (snapshot.age) parts.push(`last touched ${snapshot.age}`);
  if (snapshot.count) parts.push(`${snapshot.count} neighbours nearby`);
  const slots = parts.length > 0 ? parts.join(", ") : "no grounded slots";
  return [
    "Write exactly one short sentence (≤ 16 words) about the primary note.",
    "Use only the slot values below; do not invent details.",
    `Slots: ${slots}.`,
  ].join(" ");
}

function extractText(json) {
  try {
    const blocks = json?.content || [];
    const firstText = blocks.find((b) => b.type === "text");
    const raw = (firstText?.text || "").replace(/\s+/g, " ").trim();
    return raw.replace(/^["']|["']$/g, "");
  } catch {
    return "";
  }
}

// Shape fingerprint: model + system prompt + keys of user-message
// content, without the actual slot values. Same job class always
// yields the same fingerprint regardless of which note is being
// observed, so we don't prompt-fatigue the user.
function fingerprintRequestShape(body) {
  const user = body?.messages?.[0]?.content || "";
  const skeleton = user.replace(/"[^"]*"/g, '""').replace(/\d+/g, "N");
  return [body.model, body.system?.slice(0, 80) || "", skeleton].join("|");
}

function redactedHeaders(key) {
  return {
    "content-type": "application/json",
    "x-api-key": key ? `sk-…${key.slice(-4)}` : "(none)",
    "anthropic-version": "2023-06-01",
  };
}

// ── Key storage ──────────────────────────────────────────
// Plain IndexedDB: phase-7 floor. Hardening (Credential Management API,
// passphrase-encrypted fallback) is tracked in BUILD_PLAN D7.4 notes.
function openKeyDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(KEY_STORE_DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(KEY_STORE_OBJSTORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadKeyFromIndexedDB() {
  const db = await openKeyDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KEY_STORE_OBJSTORE, "readonly");
    const req = tx.objectStore(KEY_STORE_OBJSTORE).get(KEY_STORE_ID);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function writeKeyToIndexedDB(value) {
  const db = await openKeyDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KEY_STORE_OBJSTORE, "readwrite");
    tx.objectStore(KEY_STORE_OBJSTORE).put(value, KEY_STORE_ID);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteKeyFromIndexedDB() {
  const db = await openKeyDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KEY_STORE_OBJSTORE, "readwrite");
    tx.objectStore(KEY_STORE_OBJSTORE).delete(KEY_STORE_ID);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
