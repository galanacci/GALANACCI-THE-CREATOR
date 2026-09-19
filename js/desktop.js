import { APPS } from "./apps.js";

const GRID = 16;
const EDGE = 20;
const POSITION_PREFIX = "gtc:desktop-position:";
const HINT_KEY = "gtc:desktop-hint:v1";
const LAUNCH_DELAY = 520;

const desktop = document.getElementById("gtc-desktop");
const appsHost = document.getElementById("desktop-apps");
const hint = document.getElementById("desktop-hint");
const transition = document.getElementById("launch-transition");
const launchLabel = document.getElementById("launch-label");

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const snap = (value) => Math.round(value / GRID) * GRID;
const isTouch = window.matchMedia("(hover: none), (pointer: coarse)").matches;

let selected = null;
let dragging = null;
let launchLocked = false;

const storageGet = (key) => {
  try { return localStorage.getItem(key); }
  catch { return null; }
};

const storageSet = (key, value) => {
  try { localStorage.setItem(key, value); }
  catch { /* persistence is optional */ }
};

function buildApps() {
  for (const app of APPS) {
    const shortcut = document.createElement("button");
    shortcut.type = "button";
    shortcut.className = "desktop-shortcut";
    shortcut.dataset.appId = app.id;
    shortcut.dataset.launchUrl = app.url || "";
    shortcut.dataset.label = app.label;
    shortcut.setAttribute("aria-label", `${app.label}. ${isTouch ? "Tap" : "Double click"} to open.`);

    if (!app.enabled) {
      shortcut.setAttribute("aria-disabled", "true");
    }

    const icon = document.createElement("img");
    icon.src = app.icon;
    icon.alt = "";
    icon.draggable = false;

    const label = document.createElement("span");
    label.textContent = app.label;

    shortcut.append(icon, label);
    appsHost.appendChild(shortcut);

    installShortcut(shortcut, app);
  }
}

function boundsFor(shortcut) {
  return {
    maxX: Math.max(EDGE, window.innerWidth - shortcut.offsetWidth - EDGE),
    maxY: Math.max(EDGE, window.innerHeight - shortcut.offsetHeight - EDGE - 28)
  };
}

function randomPosition(shortcut) {
  const { maxX, maxY } = boundsFor(shortcut);
  return {
    x: snap(EDGE + Math.random() * Math.max(0, maxX - EDGE)),
    y: snap(EDGE + Math.random() * Math.max(0, maxY - EDGE))
  };
}

function readPosition(shortcut) {
  const key = POSITION_PREFIX + shortcut.dataset.appId;

  try {
    const parsed = JSON.parse(storageGet(key));
    if (Number.isFinite(parsed?.x) && Number.isFinite(parsed?.y)) {
      return parsed;
    }
  } catch {
    // Fall through.
  }

  const position = randomPosition(shortcut);
  storageSet(key, JSON.stringify(position));
  return position;
}

function writePosition(shortcut, position) {
  storageSet(POSITION_PREFIX + shortcut.dataset.appId, JSON.stringify(position));
}

function renderShortcut(shortcut, position) {
  const { maxX, maxY } = boundsFor(shortcut);

  const next = {
    x: clamp(snap(position.x), EDGE, maxX),
    y: clamp(snap(position.y), EDGE, maxY)
  };

  shortcut._desktopPosition = next;
  shortcut.style.transform = `translate3d(${next.x}px, ${next.y}px, 0)`;

  if (selected === shortcut) renderHint(shortcut);
}

function renderHint(shortcut) {
  if (!hint || !shortcut?._desktopPosition) return;

  const width = hint.offsetWidth;
  const position = shortcut._desktopPosition;

  const x = clamp(
    position.x + shortcut.offsetWidth / 2 - width / 2,
    8,
    Math.max(8, window.innerWidth - width - 8)
  );

  const below = position.y + shortcut.offsetHeight + 9;
  const y = below + 28 <= window.innerHeight
    ? below
    : Math.max(8, position.y - 30);

  hint.style.transform = `translate3d(${x}px, ${y}px, 0)`;
}

function selectShortcut(shortcut) {
  if (selected && selected !== shortcut) {
    selected.classList.remove("is-selected");
  }

  selected = shortcut;
  shortcut.classList.add("is-selected");
  renderHint(shortcut);
}

function clearSelection() {
  selected?.classList.remove("is-selected");
  selected = null;
}

function dismissHint() {
  hint?.classList.remove("is-visible");
  storageSet(HINT_KEY, "dismissed");
}

async function launchShortcut(shortcut, app) {
  if (launchLocked || !app.enabled || !app.url) return;

  launchLocked = true;
  dismissHint();
  clearSelection();

  if (launchLabel) {
    launchLabel.textContent = `OPENING ${app.label}...`;
  }

  if (transition) {
    transition.hidden = false;
    transition.setAttribute("aria-hidden", "false");
    requestAnimationFrame(() => transition.classList.add("is-open"));
  }

  await new Promise((resolve) => window.setTimeout(resolve, LAUNCH_DELAY));
  window.location.href = app.url;
}

function installShortcut(shortcut, app) {
  renderShortcut(shortcut, readPosition(shortcut));

  requestAnimationFrame(() => {
    requestAnimationFrame(() => shortcut.classList.add("is-ready"));
  });

  shortcut.addEventListener("pointerdown", (event) => {
    if (event.button !== undefined && event.button !== 0) return;

    selectShortcut(shortcut);

    dragging = {
      shortcut,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      origin: { ...shortcut._desktopPosition },
      moved: false
    };

    shortcut.setPointerCapture?.(event.pointerId);
  });

  shortcut.addEventListener("pointermove", (event) => {
    if (!dragging || dragging.shortcut !== shortcut) return;

    const dx = event.clientX - dragging.startX;
    const dy = event.clientY - dragging.startY;

    if (Math.abs(dx) + Math.abs(dy) > 5) {
      dragging.moved = true;
    }

    if (!dragging.moved) return;

    const { maxX, maxY } = boundsFor(shortcut);

    renderShortcut(shortcut, {
      x: clamp(dragging.origin.x + dx, EDGE, maxX),
      y: clamp(dragging.origin.y + dy, EDGE, maxY)
    });
  });

  const finishPointer = (event) => {
    if (!dragging || dragging.shortcut !== shortcut) return;

    const moved = dragging.moved;
    shortcut.releasePointerCapture?.(event.pointerId);

    if (moved) {
      writePosition(shortcut, shortcut._desktopPosition);
    }

    dragging = null;

    if (!moved && isTouch) {
      launchShortcut(shortcut, app);
    }
  };

  shortcut.addEventListener("pointerup", finishPointer);
  shortcut.addEventListener("pointercancel", finishPointer);

  shortcut.addEventListener("dblclick", (event) => {
    event.preventDefault();
    if (!isTouch && !dragging) launchShortcut(shortcut, app);
  });

  shortcut.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      launchShortcut(shortcut, app);
    }
  });
}

desktop?.addEventListener("pointerdown", (event) => {
  if (event.target === desktop || event.target === appsHost) {
    clearSelection();
  }
});

window.addEventListener("resize", () => {
  document.querySelectorAll(".desktop-shortcut").forEach((shortcut) => {
    renderShortcut(shortcut, shortcut._desktopPosition || readPosition(shortcut));
    writePosition(shortcut, shortcut._desktopPosition);
  });
});

window.addEventListener("pageshow", () => {
  launchLocked = false;

  if (transition) {
    transition.classList.remove("is-open");
    transition.hidden = true;
    transition.setAttribute("aria-hidden", "true");
  }
});

if (hint) {
  hint.textContent = isTouch ? "TAP TO OPEN" : "DOUBLE CLICK TO OPEN";
  if (storageGet(HINT_KEY) !== "dismissed") {
    hint.classList.add("is-visible");
  }
}

buildApps();

const initialShortcut = appsHost?.querySelector(".desktop-shortcut");
if (hint?.classList.contains("is-visible") && initialShortcut) {
  renderHint(initialShortcut);
}
