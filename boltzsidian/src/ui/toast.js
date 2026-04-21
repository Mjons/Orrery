// Toast — bottom-center transient bar.
//
// Two shapes:
//   toast("message")             → plain text, auto-dismisses.
//   toast.actions("prompt", [{label, kind?, onClick}], { duration })
//       → message with inline action buttons. The toast dismisses when the
//         user clicks an action, clicks outside it, or the duration expires.
//
// `kind` is optional — "primary" paints the button in the accent. Default
// buttons are ghosted.

let hideTimer = 0;

function show(contentRender, { duration = 3000 } = {}) {
  const el = document.getElementById("toast");
  if (!el) return null;
  // Clear any prior contents and state.
  el.textContent = "";
  el.classList.remove("show");
  // Let the browser notice the visibility change before we restart it —
  // prevents the fade being skipped when two toasts land back-to-back.
  // eslint-disable-next-line no-unused-expressions
  el.offsetHeight;
  contentRender(el);
  el.classList.add("show");
  if (hideTimer) clearTimeout(hideTimer);
  const dismiss = () => {
    el.classList.remove("show");
    hideTimer = 0;
  };
  hideTimer = window.setTimeout(dismiss, duration);
  return dismiss;
}

export function toast(message, opts = {}) {
  return show((el) => {
    el.textContent = message;
  }, opts);
}

toast.actions = function (message, actions = [], opts = {}) {
  const duration = opts.duration ?? 6000;
  return show(
    (el) => {
      el.innerHTML = "";
      const label = document.createElement("span");
      label.className = "toast-label";
      label.textContent = message;
      el.appendChild(label);
      for (const a of actions) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `toast-btn${a.kind === "primary" ? " toast-btn-primary" : ""}`;
        btn.textContent = a.label;
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          if (a.onClick) a.onClick();
          el.classList.remove("show");
          if (hideTimer) {
            clearTimeout(hideTimer);
            hideTimer = 0;
          }
        });
        el.appendChild(btn);
      }
    },
    { duration },
  );
};
