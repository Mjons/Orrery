// Payload preview modal for the Claude backend.
//
// BUILD_PLAN D7.4: "Claude backend shows exactly what will be sent
// before the first request of a session; user must approve once."
// The backend calls this once per request shape, not once per request —
// see claude-backend.js fingerprintRequestShape for what counts as a
// new shape.
//
// The modal is deliberately explicit: endpoint, headers (with the API
// key redacted to its last 4 chars), and the full JSON body rendered
// as monospace text. Approving caches approval for that shape until
// the tab closes. Declining throws in the backend so the router falls
// back to template — exactly what we want.

export function showPayloadPreview(preview) {
  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.className = "payload-preview-modal";
    modal.innerHTML = template(preview);

    function close(result) {
      modal.classList.remove("show");
      document.removeEventListener("keydown", onKey, true);
      setTimeout(() => modal.remove(), 180);
      resolve(result);
    }
    function onKey(e) {
      if (e.key === "Escape") {
        e.stopPropagation();
        close(false);
      }
    }
    modal.addEventListener("click", (e) => {
      if (!(e.target instanceof HTMLElement)) return;
      if (e.target === modal) {
        close(false);
        return;
      }
      const action = e.target.dataset.action;
      if (action === "approve") close(true);
      else if (action === "decline") close(false);
    });
    document.addEventListener("keydown", onKey, true);

    document.body.appendChild(modal);
    requestAnimationFrame(() => modal.classList.add("show"));
  });
}

function template(preview) {
  const body = JSON.stringify(preview.body, null, 2);
  const headers = Object.entries(preview.headers || {})
    .map(([k, v]) => `${escape(k)}: ${escape(String(v))}`)
    .join("\n");
  return `
    <div class="pp-card" role="dialog" aria-labelledby="pp-title">
      <h2 id="pp-title">Payload preview</h2>
      <p class="pp-sub">
        ${escape(preview.note || "Approving caches approval for this request shape for the rest of this session.")}
      </p>

      <div class="pp-section">
        <h3>Endpoint</h3>
        <code class="pp-inline">${escape(preview.endpoint)}</code>
      </div>

      <div class="pp-section">
        <h3>Model</h3>
        <code class="pp-inline">${escape(preview.model)}</code>
      </div>

      <div class="pp-section">
        <h3>Headers (key redacted)</h3>
        <pre class="pp-block">${escape(headers)}</pre>
      </div>

      <div class="pp-section">
        <h3>Body</h3>
        <pre class="pp-block">${escape(body)}</pre>
      </div>

      <div class="pp-actions">
        <button type="button" data-action="decline" class="pp-btn">
          Cancel — use template instead
        </button>
        <button type="button" data-action="approve" class="pp-btn pp-btn-primary">
          Approve &amp; send
        </button>
      </div>
    </div>
  `;
}

function escape(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
