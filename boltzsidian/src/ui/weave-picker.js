// WEAVE.md — modal picker that previews scanWeave proposals and
// applies them through the same splice path the keyword-link picker
// uses. Grouped by source-note; per-proposal checkboxes; bulk accept
// or reject.
//
// The picker is "dumb" — it asks the caller to run the scan and to
// write the accepted proposals. The caller owns the vault and saver.

const CONFIRM_THRESHOLD = 40;
const REFUSE_THRESHOLD = 300;

export function createWeavePicker({ getVault, runScan, onApply } = {}) {
  const overlay = document.createElement("div");
  overlay.id = "weave-picker";
  overlay.className = "weave-picker";
  Object.assign(overlay.style, {
    position: "fixed",
    inset: "0",
    display: "none",
    alignItems: "center",
    justifyContent: "center",
    background: "rgba(10, 12, 18, 0.6)",
    backdropFilter: "blur(4px)",
    zIndex: "50",
  });

  const card = document.createElement("div");
  Object.assign(card.style, {
    width: "min(640px, 94vw)",
    maxHeight: "82vh",
    display: "flex",
    flexDirection: "column",
    background: "rgba(20, 22, 30, 0.96)",
    border: "1px solid rgba(138, 180, 255, 0.2)",
    borderRadius: "10px",
    boxShadow: "0 20px 60px rgba(0, 0, 0, 0.6)",
    overflow: "hidden",
  });
  card.addEventListener("click", (e) => e.stopPropagation());
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  const head = document.createElement("div");
  Object.assign(head.style, {
    padding: "18px 22px 10px",
    borderBottom: "1px solid var(--glass-border)",
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  });
  const eyebrow = document.createElement("p");
  eyebrow.textContent = "Weave a hub's neighborhood";
  Object.assign(eyebrow.style, {
    margin: 0,
    fontSize: "10px",
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "rgba(215, 219, 228, 0.55)",
  });
  const title = document.createElement("h2");
  Object.assign(title.style, {
    margin: 0,
    fontSize: "16px",
    fontWeight: "600",
    letterSpacing: "0.01em",
    color: "var(--text)",
  });
  const sub = document.createElement("p");
  Object.assign(sub.style, {
    margin: "2px 0 0",
    fontSize: "12px",
    color: "var(--text-faint)",
  });
  head.append(eyebrow, title, sub);

  const list = document.createElement("div");
  Object.assign(list.style, {
    flex: "1 1 auto",
    overflowY: "auto",
    overscrollBehavior: "contain",
    padding: "6px 0",
  });

  const foot = document.createElement("div");
  Object.assign(foot.style, {
    padding: "12px 18px",
    borderTop: "1px solid var(--glass-border)",
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: "12px",
  });
  const selectedLabel = document.createElement("span");
  Object.assign(selectedLabel.style, {
    fontSize: "11px",
    color: "var(--text-faint)",
    marginRight: "auto",
    letterSpacing: "0.04em",
  });
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.textContent = "Cancel";
  Object.assign(cancelBtn.style, {
    background: "transparent",
    color: "var(--text-dim)",
    border: "1px solid var(--glass-border)",
    padding: "6px 14px",
    borderRadius: "999px",
    fontSize: "12px",
    fontFamily: "inherit",
    cursor: "pointer",
  });
  cancelBtn.addEventListener("click", close);
  const applyBtn = document.createElement("button");
  applyBtn.type = "button";
  applyBtn.textContent = "Weave";
  Object.assign(applyBtn.style, {
    background: "transparent",
    color: "var(--accent)",
    border: "1px solid rgba(138, 180, 255, 0.5)",
    padding: "6px 18px",
    borderRadius: "999px",
    fontSize: "12px",
    fontFamily: "inherit",
    cursor: "pointer",
    fontWeight: "600",
  });
  applyBtn.addEventListener("click", commit);
  foot.append(selectedLabel, cancelBtn, applyBtn);

  card.append(head, list, foot);
  overlay.append(card);
  document.body.appendChild(overlay);

  // ── State ──────────────────────────────────────────────
  let scanResult = null;
  let skipSet = new Set(); // `fromId:toId` that the user unchecked

  document.addEventListener("keydown", onKey, true);
  function onKey(e) {
    if (overlay.style.display === "none") return;
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      commit();
    }
  }

  // ── Public API ────────────────────────────────────────
  // scanOpts are forwarded to runScan — e.g. { titlePrefix: "X",
  // sameRootOnly: false } for cross-root discovery.
  let lastScanOpts = null;
  function open(hub, scanOpts = null) {
    if (!hub) return;
    overlay.style.display = "flex";
    skipSet = new Set();
    lastScanOpts = scanOpts;
    render(hub);
  }
  function close() {
    overlay.style.display = "none";
    scanResult = null;
    list.innerHTML = "";
  }
  function isOpen() {
    return overlay.style.display !== "none";
  }
  function dispose() {
    document.removeEventListener("keydown", onKey, true);
    overlay.remove();
  }

  return { open, close, isOpen, dispose };

  // ── Internals ─────────────────────────────────────────
  function render(hub) {
    const vault = getVault?.();
    if (!vault || !runScan) {
      title.textContent = "No vault";
      sub.textContent = "";
      list.innerHTML = "";
      updateFooter();
      return;
    }
    scanResult = runScan(vault, hub.id, lastScanOpts);
    title.textContent = `→ [[${hub.title || "untitled"}]]`;
    const { satellites, proposals, skipped } = scanResult;
    sub.textContent = `${satellites.length} satellite${satellites.length === 1 ? "" : "s"} · ${proposals.length} proposal${proposals.length === 1 ? "" : "s"} (${skipped.alreadyLinked} already linked, ${skipped.noMention} no prose mention)`;

    list.innerHTML = "";
    if (proposals.length === 0) {
      const empty = document.createElement("p");
      Object.assign(empty.style, {
        padding: "24px 22px",
        color: "var(--text-faint)",
        fontSize: "13px",
        textAlign: "center",
        margin: 0,
      });
      empty.textContent =
        "No prose-mention crosslinks to propose. The neighborhood is already woven (or the satellites don't reference each other in body text).";
      list.appendChild(empty);
      updateFooter();
      return;
    }

    // Group proposals by `from` note for readable review.
    const byFrom = new Map();
    for (const p of proposals) {
      const key = p.from.id;
      if (!byFrom.has(key)) byFrom.set(key, { from: p.from, items: [] });
      byFrom.get(key).items.push(p);
    }

    for (const { from, items } of byFrom.values()) {
      const group = document.createElement("div");
      Object.assign(group.style, {
        padding: "10px 22px 12px",
        borderBottom: "1px solid rgba(255, 255, 255, 0.04)",
      });
      const groupHead = document.createElement("div");
      groupHead.textContent = from.title || from.path || "(untitled)";
      Object.assign(groupHead.style, {
        fontSize: "12px",
        fontWeight: "600",
        color: "var(--text)",
        marginBottom: "6px",
      });
      group.appendChild(groupHead);

      for (const p of items) {
        const key = `${p.from.id}:${p.to.id}`;
        const row = document.createElement("label");
        Object.assign(row.style, {
          display: "flex",
          alignItems: "flex-start",
          gap: "10px",
          padding: "4px 0",
          cursor: "pointer",
          fontSize: "12px",
          lineHeight: "1.5",
          color: "var(--text-dim)",
        });
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = !skipSet.has(key);
        cb.addEventListener("change", () => {
          if (cb.checked) skipSet.delete(key);
          else skipSet.add(key);
          updateFooter();
        });
        Object.assign(cb.style, {
          marginTop: "4px",
          accentColor: "var(--accent)",
        });

        const body = document.createElement("span");
        body.innerHTML = `→ <span style="color: var(--accent)">[[${escapeHtml(
          p.to.title,
        )}]]</span> <span style="color: var(--text-faint)">· "${escapeHtml(
          p.before.trim(),
        )}<span style="color: var(--text)">${escapeHtml(p.matchedText)}</span>${escapeHtml(p.after.trim())}"</span>`;
        row.append(cb, body);
        group.appendChild(row);
      }
      list.appendChild(group);
    }
    updateFooter();
  }

  function checkedCount() {
    if (!scanResult) return 0;
    let n = 0;
    for (const p of scanResult.proposals) {
      if (!skipSet.has(`${p.from.id}:${p.to.id}`)) n++;
    }
    return n;
  }

  function updateFooter() {
    const n = checkedCount();
    selectedLabel.textContent = n ? `${n} selected` : "";
    applyBtn.disabled = n === 0;
    applyBtn.style.opacity = n === 0 ? "0.4" : "1";
    applyBtn.style.cursor = n === 0 ? "default" : "pointer";
  }

  function commit() {
    if (!scanResult) return;
    const accepted = scanResult.proposals.filter(
      (p) => !skipSet.has(`${p.from.id}:${p.to.id}`),
    );
    if (accepted.length === 0) return;
    if (accepted.length >= REFUSE_THRESHOLD) {
      window.alert(
        `${accepted.length} proposals is too many for one pass. Uncheck some or split the hub.`,
      );
      return;
    }
    if (accepted.length >= CONFIRM_THRESHOLD) {
      if (
        !window.confirm(
          `Weave ${accepted.length} new links across this hub's neighborhood?`,
        )
      )
        return;
    }
    close();
    if (onApply) onApply(accepted);
  }
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
