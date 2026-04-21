// About modal.
//
// One paragraph on what the app is, an explicit privacy statement, a
// version string, and a GitHub link. Accessible from the welcome card and
// from the settings pane. No router, no persistence — a transient overlay.

const VERSION = "0.3.5";
const GITHUB_URL = "https://github.com/"; // TBD — points nowhere until the repo is public
const DONATE_URL = null; // set when GitHub Sponsors / Ko-fi is live

let current = null;

export function showAbout() {
  if (current) return current;
  const modal = document.createElement("div");
  modal.className = "about-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-labelledby", "about-title");
  modal.innerHTML = `
    <div class="about-card">
      <header class="about-head">
        <h2 id="about-title">Boltzsidian</h2>
        <button class="about-close" type="button" aria-label="Close">×</button>
      </header>

      <section class="about-section">
        <p>
          A notebook you walk through. Every note is a star; links tug
          them into orbit. Open a folder of markdown and it becomes a
          universe.
        </p>
      </section>

      <section class="about-section">
        <h3>Privacy</h3>
        <ul>
          <li>Your notes never leave your machine.</li>
          <li>No analytics. No telemetry. No phone-home.</li>
          <li>
            Optional Claude voice (Phase 7, off by default) shows exactly
            what is sent before sending.
          </li>
          <li>
            The demo vault lives in browser-local storage (OPFS). Reset
            it any time from Settings.
          </li>
        </ul>
      </section>

      <section class="about-section">
        <h3>Colophon</h3>
        <p class="about-colophon">
          Built with three.js, CodeMirror 6, and the File System Access
          API. MIT licensed. Single-user by design.
        </p>
      </section>

      <footer class="about-foot">
        <span class="about-version">v${VERSION}</span>
        <span class="about-links">
          <a href="${GITHUB_URL}" target="_blank" rel="noopener">source</a>
          ${DONATE_URL ? `· <a href="${DONATE_URL}" target="_blank" rel="noopener">donate</a>` : ""}
        </span>
      </footer>
    </div>
  `;

  function close() {
    if (current !== modal) return;
    modal.classList.remove("show");
    document.removeEventListener("keydown", onKey, true);
    setTimeout(() => {
      modal.remove();
      if (current === modal) current = null;
    }, 200);
  }

  function onKey(e) {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    }
  }

  modal.addEventListener("click", (e) => {
    if (
      e.target === modal ||
      (e.target instanceof HTMLElement && e.target.closest(".about-close"))
    ) {
      close();
    }
  });
  document.addEventListener("keydown", onKey, true);

  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add("show"));
  current = modal;
  return { close };
}
