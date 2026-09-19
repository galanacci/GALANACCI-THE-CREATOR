import { APPS } from "./apps.js";

const GRID = 16;
const EDGE = 20;
const COLLISION_GAP = 0;
const POSITION_PREFIX = "gtc:desktop-position:";
const HINT_KEY = "gtc:desktop-hint:v1";
const LAUNCH_DELAY = 520;

const desktop = document.getElementById("gtc-desktop");
const appsHost = document.getElementById("desktop-apps");
const hint = document.getElementById("desktop-hint");
const folderWindow = document.getElementById("folder-window");
const experimentWindow = document.getElementById("experiment-window");
const experimentFrame = document.getElementById("experiment-frame");
const experimentTitle = document.getElementById("experiment-window-title");
const folderChrome = folderWindow?.querySelector(".folder-window__chrome");
const folderResizeHandles = [...(folderWindow?.querySelectorAll("[data-resize]") || [])];
const transition = document.getElementById("launch-transition");
const launchLabel = document.getElementById("launch-label");

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const snap = (value) => Math.round(value / GRID) * GRID;
const isTouch = window.matchMedia("(hover: none), (pointer: coarse)").matches;

let selected = null;
let dragging = null;
let folderResizing = null;
let launchLocked = false;

const storageGet = (key) => {
  try { return localStorage.getItem(key); }
  catch { return null; }
};

const storageSet = (key, value) => {
  try { localStorage.setItem(key, value); }
  catch { /* persistence is optional */ }
};

document.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

function buildApps() {
  for (const app of APPS) {
    const shortcut = document.createElement("button");
    shortcut.type = "button";
    shortcut.className = "desktop-shortcut";
    shortcut.dataset.appId = app.id;
    shortcut.dataset.launchUrl = app.url || "";
    shortcut.dataset.label = app.label;
    shortcut.setAttribute("aria-label", `${app.label}. ${isTouch ? "Tap" : "Double click"} to open.`);

    if (!app.enabled) shortcut.setAttribute("aria-disabled", "true");

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
    if (Number.isFinite(parsed?.x) && Number.isFinite(parsed?.y)) return parsed;
  } catch {}

  const position = randomPosition(shortcut);
  storageSet(key, JSON.stringify(position));
  return position;
}

function writePosition(shortcut, position) {
  storageSet(POSITION_PREFIX + shortcut.dataset.appId, JSON.stringify(position));
}

function overlaps(shortcut, position, other) {
  const otherPosition = other._desktopPosition;
  if (!otherPosition) return false;

  return position.x < otherPosition.x + other.offsetWidth + COLLISION_GAP
    && position.x + shortcut.offsetWidth + COLLISION_GAP > otherPosition.x
    && position.y < otherPosition.y + other.offsetHeight + COLLISION_GAP
    && position.y + shortcut.offsetHeight + COLLISION_GAP > otherPosition.y;
}

function findAvailablePosition(shortcut, position) {
  const { maxX, maxY } = boundsFor(shortcut);
  const candidate = {
    x: clamp(snap(position.x), EDGE, maxX),
    y: clamp(snap(position.y), EDGE, maxY)
  };
  const otherShortcuts = [...document.querySelectorAll(".desktop-shortcut")]
    .filter((other) => other !== shortcut);

  const isAvailable = (next) => otherShortcuts.every((other) => !overlaps(shortcut, next, other));
  if (isAvailable(candidate)) return candidate;

  let closest = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (let y = EDGE; y <= maxY; y += GRID) {
    for (let x = EDGE; x <= maxX; x += GRID) {
      const next = { x, y };
      if (!isAvailable(next)) continue;
      const distance = Math.abs(next.x - candidate.x) + Math.abs(next.y - candidate.y);
      if (distance < closestDistance) {
        closest = next;
        closestDistance = distance;
      }
    }
  }

  return closest || candidate;
}

function renderShortcut(shortcut, position) {
  const next = findAvailablePosition(shortcut, position);
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
  const y = below + 28 <= window.innerHeight ? below : Math.max(8, position.y - 30);
  hint.style.transform = `translate3d(${x}px, ${y}px, 0)`;
}

function selectShortcut(shortcut) {
  if (selected && selected !== shortcut) selected.classList.remove("is-selected");
  selected = shortcut;
  shortcut.classList.add("is-selected");
  renderHint(shortcut);
}

function clearSelection() {
  selected?.classList.remove("is-selected");
  selected = null;
}

function clearFolderSelection() {
  document.querySelectorAll(".app-list__row.is-selected").forEach((item) => {
    item.classList.remove("is-selected");
  });
}

function dismissHint() {
  hint?.classList.remove("is-visible");
  storageSet(HINT_KEY, "dismissed");
}

function closeFolderWindow() {
  if (!folderWindow) return;
  folderWindow.classList.remove("is-open");
  folderWindow.hidden = true;
  folderWindow.setAttribute("aria-hidden", "true");
  clearFolderSelection();
}

function openFolderWindow(app) {
  if (!folderWindow || !app.enabled) return;
  dismissHint();
  clearSelection();
  folderWindow.hidden = false;
  folderWindow.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => folderWindow.classList.add("is-open"));
}

function closeExperimentWindow() {
  if (!experimentWindow) return;
  experimentWindow.classList.remove("is-open");
  experimentWindow.hidden = true;
  experimentWindow.setAttribute("aria-hidden", "true");
  if (experimentFrame) experimentFrame.src = "about:blank";
}

function openExperimentWindow(url, label) {
  if (!experimentWindow || !experimentFrame) return;
  closeFolderWindow();
  dismissHint();
  clearSelection();
  experimentTitle.textContent = label;
  experimentFrame.title = label;
  experimentFrame.src = url;
  experimentWindow.hidden = false;
  experimentWindow.setAttribute("aria-hidden", "false");
  requestAnimationFrame(() => experimentWindow.classList.add("is-open"));
}

function openShortcut(shortcut, app) {
  if (app.type === "folder") {
    openFolderWindow(app);
    return;
  }
  launchShortcut(shortcut, app);
}

async function launchShortcut(shortcut, app) {
  if (launchLocked || !app.enabled || !app.url) return;
  launchLocked = true;
  dismissHint();
  clearSelection();

  if (launchLabel) launchLabel.textContent = `OPENING ${app.label}...`;

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
    if (Math.abs(dx) + Math.abs(dy) > 5) dragging.moved = true;
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

    if (moved) writePosition(shortcut, shortcut._desktopPosition);
    dragging = null;

    if (!moved && isTouch) openShortcut(shortcut, app);
  };

  shortcut.addEventListener("pointerup", finishPointer);
  shortcut.addEventListener("pointercancel", finishPointer);

  shortcut.addEventListener("dblclick", (event) => {
    event.preventDefault();
    if (!isTouch && !dragging) openShortcut(shortcut, app);
  });

  shortcut.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openShortcut(shortcut, app);
    }
  });
}

desktop?.addEventListener("pointerdown", (event) => {
  if (event.target === desktop || event.target === appsHost) clearSelection();
});

window.addEventListener("resize", () => {
  document.querySelectorAll(".desktop-shortcut").forEach((shortcut) => {
    renderShortcut(shortcut, shortcut._desktopPosition || readPosition(shortcut));
    writePosition(shortcut, shortcut._desktopPosition);
  });
});

window.addEventListener("pageshow", () => {
  launchLocked = false;
  closeExperimentWindow();

  if (transition) {
    transition.classList.remove("is-open");
    transition.hidden = true;
    transition.setAttribute("aria-hidden", "true");
  }
});

folderWindow?.querySelector("[data-close-folder]")?.addEventListener("click", closeFolderWindow);
experimentWindow?.querySelector("[data-close-experiment]")?.addEventListener("click", closeExperimentWindow);

folderWindow?.addEventListener("pointerdown", (event) => {
  if (!event.target.closest(".app-list__row")) clearFolderSelection();
});

document.querySelectorAll("[data-experiment-link]").forEach((link) => {
  const openLinkedExperiment = (event) => {
    event.preventDefault();
    openExperimentWindow(link.href, link.dataset.label || link.textContent.trim());
  };

  link.addEventListener("click", (event) => {
    clearFolderSelection();
    link.classList.add("is-selected");
    if (isTouch) openLinkedExperiment(event);
    else event.preventDefault();
  });

  link.addEventListener("dblclick", (event) => {
    if (!isTouch) openLinkedExperiment(event);
  });

  link.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") openLinkedExperiment(event);
  });
});

function moveFolderWindow(event) {
  if (!folderResizing || !folderWindow) return;

  const { direction, start, rect } = folderResizing;
  const dx = event.clientX - start.x;
  const dy = event.clientY - start.y;
  const minWidth = 420;
  const minHeight = 220;
  let left = rect.left;
  let top = rect.top;
  let width = rect.width;
  let height = rect.height;

  if (direction.includes("e")) width = clamp(rect.width + dx, minWidth, window.innerWidth - left);
  if (direction.includes("s")) height = clamp(rect.height + dy, minHeight, window.innerHeight - top);
  if (direction.includes("w")) {
    left = clamp(rect.left + dx, 0, rect.right - minWidth);
    width = rect.right - left;
  }
  if (direction.includes("n")) {
    top = clamp(rect.top + dy, 0, rect.bottom - minHeight);
    height = rect.bottom - top;
  }

  folderWindow.style.transform = "none";
  folderWindow.style.left = `${left}px`;
  folderWindow.style.top = `${top}px`;
  folderWindow.style.width = `${width}px`;
  folderWindow.style.height = `${height}px`;
}

function finishFolderWindowResize() {
  folderResizing = null;
}

folderResizeHandles.forEach((handle) => {
  handle.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    const rect = folderWindow.getBoundingClientRect();
    folderResizing = {
      direction: handle.dataset.resize,
      start: { x: event.clientX, y: event.clientY },
      rect
    };
    handle.setPointerCapture?.(event.pointerId);
  });
});

window.addEventListener("pointermove", moveFolderWindow);
window.addEventListener("pointerup", finishFolderWindowResize);
window.addEventListener("pointercancel", finishFolderWindowResize);

folderChrome?.addEventListener("pointerdown", (event) => {
  if (!folderWindow || (event.button !== undefined && event.button !== 0)) return;
  if (event.target.closest("button")) return;

  const rect = folderWindow.getBoundingClientRect();
  const start = {
    x: event.clientX,
    y: event.clientY,
    left: rect.left,
    top: rect.top
  };

  const move = (moveEvent) => {
    const maxLeft = Math.max(0, window.innerWidth - folderWindow.offsetWidth);
    const maxTop = Math.max(0, window.innerHeight - folderWindow.offsetHeight);
    folderWindow.style.transform = "none";
    folderWindow.style.left = `${clamp(start.left + moveEvent.clientX - start.x, 0, maxLeft)}px`;
    folderWindow.style.top = `${clamp(start.top + moveEvent.clientY - start.y, 0, maxTop)}px`;
  };

  const stop = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", stop);
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", stop, { once: true });
});

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (experimentWindow && !experimentWindow.hidden) closeExperimentWindow();
  else closeFolderWindow();
});

buildApps();
