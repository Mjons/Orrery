// Coachmarks — tiny one-shot tips that teach the app's gestures by pointing
// at where the gesture happens. Each coachmark fires at most once per user
// (dismissal persists in localStorage). The caller decides *when* a given
// coachmark is eligible to fire; this module handles queueing, placement,
// and persistence.
//
// Design notes:
//   - Never modal. Always dismissable.
//   - At most one visible at a time. Later requests queue, showing in order.
//   - Auto-dismiss after 14s so a user who never looks still recovers.
//   - Reset button in Settings surfaces `resetAll()` for testers.

const DISMISS_KEY = "boltzsidian.coachmarks.dismissed.v1";
const AUTO_DISMISS_MS = 14000;

const LIBRARY = {
  "click-to-open": {
    text: "Click a star to read its note.",
  },
  "cmd-n": {
    text: "Press N to write a new note at the camera's center.",
  },
  "alt-drag": {
    text: "Alt-drag between two stars to link them physically.",
  },
  "right-click": {
    text: "Right-click a tether to remove the link.",
  },
  "cmd-k": {
    text: "Cmd/Ctrl + K searches the whole vault.",
  },
  "settings-slash": {
    text: "Press  \\  for settings.",
  },
  pin: {
    text: "Pin the open note to freeze its orbit.",
  },
};

function loadDismissed() {
  try {
    return new Set(JSON.parse(localStorage.getItem(DISMISS_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function saveDismissed(set) {
  localStorage.setItem(DISMISS_KEY, JSON.stringify([...set]));
}

export function createCoachmarks() {
  const dismissed = loadDismissed();
  const queue = [];
  let currentId = null;
  let host = null;
  let hideTimer = 0;

  function ensureHost() {
    if (host) return host;
    host = document.createElement("div");
    host.id = "coachmark";
    host.setAttribute("role", "status");
    host.setAttribute("aria-live", "polite");
    host.innerHTML = `
      <div class="cm-body">
        <span class="cm-text"></span>
        <button class="cm-dismiss" type="button" aria-label="Dismiss">✓</button>
      </div>
      <span class="cm-arrow"></span>
    `;
    host
      .querySelector(".cm-dismiss")
      .addEventListener("click", () => dismissCurrent());
    document.body.appendChild(host);
    return host;
  }

  function schedule(id, options = {}) {
    if (!LIBRARY[id]) return false;
    if (dismissed.has(id)) return false;
    if (currentId === id || queue.some((q) => q.id === id)) return false;
    queue.push({ id, options });
    flush();
    return true;
  }

  function flush() {
    if (currentId != null) return;
    const next = queue.shift();
    if (!next) return;
    if (dismissed.has(next.id)) return flush(); // might have been dismissed externally
    show(next.id, next.options);
  }

  function show(id, options = {}) {
    const mark = LIBRARY[id];
    if (!mark) return;
    ensureHost();
    currentId = id;

    host.querySelector(".cm-text").textContent = mark.text;

    // Position — either anchored to an element's bounding rect or the
    // bottom-centre of the viewport. The anchor can be a DOM node, a
    // function returning a rect, or a { x, y } point.
    place(host, options.anchor, options.placement);
    host.classList.add("show");

    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = window.setTimeout(
      () => dismissCurrent({ persist: true }),
      options.duration || AUTO_DISMISS_MS,
    );
  }

  function dismissCurrent({ persist = true } = {}) {
    if (currentId == null) return;
    if (persist) {
      dismissed.add(currentId);
      saveDismissed(dismissed);
    }
    host.classList.remove("show");
    currentId = null;
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = 0;
    }
    // small delay so the fade-out completes before the next one appears
    setTimeout(flush, 260);
  }

  // Mark seen without showing — useful when the user performs the target
  // gesture before the coachmark fires.
  function markSeen(id) {
    if (dismissed.has(id)) return;
    dismissed.add(id);
    saveDismissed(dismissed);
    // If this id is currently shown or queued, drop it.
    if (currentId === id) dismissCurrent({ persist: false });
    for (let i = queue.length - 1; i >= 0; i--) {
      if (queue[i].id === id) queue.splice(i, 1);
    }
  }

  function hasSeen(id) {
    return dismissed.has(id);
  }

  function resetAll() {
    dismissed.clear();
    saveDismissed(dismissed);
  }

  return { schedule, markSeen, hasSeen, resetAll, dismissCurrent };
}

function place(host, anchor, placement) {
  let rect = null;
  if (!anchor) {
    host.style.left = "50%";
    host.style.top = "auto";
    host.style.bottom = "96px";
    host.style.transform = "translateX(-50%)";
    host.dataset.placement = "bottom-center";
    return;
  }
  if (typeof anchor === "function") rect = anchor();
  else if (anchor && typeof anchor.getBoundingClientRect === "function")
    rect = anchor.getBoundingClientRect();
  else if (anchor && "x" in anchor && "y" in anchor)
    rect = {
      left: anchor.x,
      top: anchor.y,
      width: 0,
      height: 0,
      right: anchor.x,
      bottom: anchor.y,
    };

  if (!rect) {
    host.style.left = "50%";
    host.style.top = "auto";
    host.style.bottom = "96px";
    host.style.transform = "translateX(-50%)";
    host.dataset.placement = "bottom-center";
    return;
  }

  const place = placement || "below";
  host.style.bottom = "auto";
  if (place === "above") {
    host.style.left = `${rect.left + rect.width / 2}px`;
    host.style.top = `${rect.top - 12}px`;
    host.style.transform = "translate(-50%, -100%)";
    host.dataset.placement = "above";
  } else {
    host.style.left = `${rect.left + rect.width / 2}px`;
    host.style.top = `${rect.bottom + 12}px`;
    host.style.transform = "translateX(-50%)";
    host.dataset.placement = "below";
  }
}
