import { APPS } from "./apps.js";

const GRID = 16;
const EDGE = 20;
const COLLISION_GAP = 0;
const POSITION_PREFIX = "gtc:desktop-position:";

/*
  Stable first-visit desktop positions.
  Once a user moves a shortcut, localStorage takes priority forever.
*/
const DEFAULT_SHORTCUT_POSITIONS = Object.freeze({
  "pog-exe": Object.freeze({ x: 32, y: 32 }),
  "experiments-folder": Object.freeze({ x: 32, y: 160 }),
  "ss-folder": Object.freeze({ x: 32, y: 288 })
});
const HINT_KEY = "gtc:desktop-hint:v1";
const LAUNCH_DELAY = 520;

const desktop = document.getElementById("gtc-desktop");
const appsHost = document.getElementById("desktop-apps");
const hint = document.getElementById("desktop-hint");
const folderWindows = [...document.querySelectorAll("[data-folder-window]")];
const experimentWindow = document.getElementById("experiment-window");
const experimentFrame = document.getElementById("experiment-frame");
const experimentTitle = document.getElementById("experiment-window-title");
const transition = document.getElementById("launch-transition");
const launchLabel = document.getElementById("launch-label");

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const snap = (value) => Math.round(value / GRID) * GRID;
const snapWithinBounds = (value, min, max) => {
  const gridMin = Math.ceil(min / GRID) * GRID;
  const gridMax = Math.floor(max / GRID) * GRID;

  if (gridMax < gridMin) {
    return clamp(value, min, max);
  }

  return clamp(snap(value), gridMin, gridMax);
};
const isTouch = window.matchMedia("(hover: none), (pointer: coarse)").matches;

/*
  Mobile desktop shortcuts should behave like a launcher, not like a freeform
  draggable canvas. Deterministic positions prevent saved touch drags from
  colliding with PoG.EXE, APPS, and SS.
*/
function mobileLockedShortcutPosition(shortcut) {
  const { maxX, maxY } = boundsFor(shortcut);
  const id = shortcut.dataset.appId;

  const leftColumn = clamp(64, EDGE, maxX);
  const rightColumn = clamp(
    window.innerWidth - shortcut.offsetWidth - 52,
    EDGE,
    maxX
  );

  const upperRow = clamp(
    Math.round(window.innerHeight * .43),
    EDGE,
    maxY
  );

  const lowerRow = clamp(
    upperRow + shortcut.offsetHeight + 22,
    EDGE,
    maxY
  );

  if (id === "pog-exe") {
    return {
      x: rightColumn,
      y: upperRow
    };
  }

  if (id === "ss-folder") {
    return {
      x: leftColumn,
      y: upperRow
    };
  }

  if (id === "experiments-folder") {
    return {
      x: leftColumn,
      y: lowerRow
    };
  }

  const shortcuts = [
    ...document.querySelectorAll(".desktop-shortcut")
  ];

  const index = Math.max(0, shortcuts.indexOf(shortcut));

  return {
    x: clamp(leftColumn, EDGE, maxX),
    y: clamp(upperRow + index * (shortcut.offsetHeight + 22), EDGE, maxY)
  };
}

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
    shortcut.setAttribute(
      "aria-label",
      `${app.label}. ${isTouch ? "Tap" : "Double click"} to open.`
    );

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

function defaultPosition(shortcut) {
  const savedDefault =
    DEFAULT_SHORTCUT_POSITIONS[shortcut.dataset.appId];

  if (savedDefault) {
    return { ...savedDefault };
  }

  const shortcuts = [
    ...document.querySelectorAll(".desktop-shortcut")
  ];

  const index = Math.max(0, shortcuts.indexOf(shortcut));
  const row = index % 5;
  const column = Math.floor(index / 5);

  return {
    x: EDGE + column * 128,
    y: EDGE + row * 128
  };
}

function readPosition(shortcut) {
  const key = POSITION_PREFIX + shortcut.dataset.appId;

  try {
    const parsed = JSON.parse(storageGet(key));

    if (
      Number.isFinite(parsed?.x) &&
      Number.isFinite(parsed?.y)
    ) {
      return {
        x: parsed.x,
        y: parsed.y
      };
    }
  } catch {}

  const position = defaultPosition(shortcut);

  storageSet(key, JSON.stringify(position));

  return position;
}

function writePosition(shortcut, position) {
  storageSet(POSITION_PREFIX + shortcut.dataset.appId, JSON.stringify(position));
}

function overlaps(shortcut, position, other, otherPosition = other._desktopPosition) {
  if (!otherPosition) return false;

  return position.x < otherPosition.x + other.offsetWidth + COLLISION_GAP
    && position.x + shortcut.offsetWidth + COLLISION_GAP > otherPosition.x
    && position.y < otherPosition.y + other.offsetHeight + COLLISION_GAP
    && position.y + shortcut.offsetHeight + COLLISION_GAP > otherPosition.y;
}

function overlapsDesktopPoster(shortcut, position) {
  const poster = document.querySelector("[data-desktop-poster]");

  if (
    !poster ||
    poster.offsetWidth <= 0 ||
    poster.offsetHeight <= 0
  ) {
    return false;
  }

  const rect = poster.getBoundingClientRect();
  const gap = 10;

  return (
    position.x < rect.right + gap &&
    position.x + shortcut.offsetWidth + gap > rect.left &&
    position.y < rect.bottom + gap &&
    position.y + shortcut.offsetHeight + gap > rect.top
  );
}
function findAvailablePosition(shortcut, position) {
  const { maxX, maxY } = boundsFor(shortcut);
  const candidate = {
    x: snapWithinBounds(position.x, EDGE, maxX),
    y: snapWithinBounds(position.y, EDGE, maxY)
  };

  const otherShortcuts = [...document.querySelectorAll(".desktop-shortcut")]
    .filter((other) => other !== shortcut);

  const isAvailable = (next) =>
    otherShortcuts.every((other) => !overlaps(shortcut, next, other)) &&
    !overlapsDesktopPoster(shortcut, next);

  if (isAvailable(candidate)) return candidate;

  let closest = null;
  let closestDistance = Number.POSITIVE_INFINITY;

  const firstGridX = Math.ceil(EDGE / GRID) * GRID;
  const firstGridY = Math.ceil(EDGE / GRID) * GRID;

  for (let y = firstGridY; y <= maxY; y += GRID) {
    for (let x = firstGridX; x <= maxX; x += GRID) {
      const next = { x, y };
      if (!isAvailable(next)) continue;

      const distance =
        Math.abs(next.x - candidate.x) + Math.abs(next.y - candidate.y);

      if (distance < closestDistance) {
        closest = next;
        closestDistance = distance;
      }
    }
  }

  return closest || candidate;
}

/* GTC MOBILE SHORTCUT DRAG RESTORE V1
   Touch shortcuts intentionally use the same freeform drag/collision system
   as desktop. A tap still opens through the pointerup logic below.
*/
function renderShortcut(shortcut, position) {
  const { maxX, maxY } = boundsFor(shortcut);

  /*
    Rendering only clamps to the current viewport. Collision repair happens
    explicitly during initial recovery and after a completed desktop drop, so
    passive browser resizing never overwrites a remembered position.
  */
  const next = {
    x: snapWithinBounds(position.x, EDGE, maxX),
    y: snapWithinBounds(position.y, EDGE, maxY)
  };

  shortcut._desktopPosition = next;
  shortcut.style.transform =
    `translate3d(${next.x}px, ${next.y}px, 0)`;

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

function clearFolderSelection(folderWindow = document) {
  folderWindow.querySelectorAll(".app-list__row.is-selected").forEach((item) => {
    item.classList.remove("is-selected");
  });
}

function dismissHint() {
  hint?.classList.remove("is-visible");
  storageSet(HINT_KEY, "dismissed");
}

function materializeFolderPosition(folderWindow) {
  if (!folderWindow) return;

  // Folder windows open centered with a CSS translate transform. If we simply
  // switch that transform off on the first drag frame, the browser briefly
  // reinterprets left:50% / top:50% as the window's top-left position, which
  // creates the visible jump. Convert the current rendered position to real
  // pixel coordinates before dragging or resizing begins.
  const rect = folderWindow.getBoundingClientRect();

  const previousTransition = folderWindow.style.transition;
  folderWindow.style.transition = "none";
  folderWindow.style.left = `${rect.left}px`;
  folderWindow.style.top = `${rect.top}px`;
  folderWindow.style.transform = "none";

  // Commit the geometry while transitions are disabled, then restore any
  // inline transition value. The base CSS transition remains available for
  // future open/close opacity changes.
  void folderWindow.offsetWidth;

  if (previousTransition) {
    folderWindow.style.transition = previousTransition;
  } else {
    folderWindow.style.removeProperty("transition");
  }
}

function closeFolderWindow(folderWindow) {
  if (!folderWindow) return;

  folderWindow.classList.remove("is-open");
  folderWindow.hidden = true;
  folderWindow.setAttribute("aria-hidden", "true");
  clearFolderSelection(folderWindow);
}

function closeAllFolderWindows(except = null) {
  folderWindows.forEach((folderWindow) => {
    if (folderWindow !== except && !folderWindow.hidden) {
      closeFolderWindow(folderWindow);
    }
  });
}

function openFolderWindow(app) {
  if (!app.enabled || !app.folderTarget) return;

  const folderWindow = folderWindows.find(
    (candidate) => candidate.dataset.folderWindow === app.folderTarget
  );

  if (!folderWindow) return;

  dismissHint();
  clearSelection();
  closeAllFolderWindows(folderWindow);

  folderWindow.hidden = false;
  folderWindow.setAttribute("aria-hidden", "false");

  requestAnimationFrame(() => {
    folderWindow.classList.add("is-open");
  });
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

  // Keep the folder that launched the app open underneath the .EXE window.
  // Closing the app returns to the same folder state.
  dismissHint();
  clearSelection();

  experimentTitle.textContent = label;
  experimentFrame.title = label;
  experimentFrame.src = url;

  experimentWindow.hidden = false;
  experimentWindow.setAttribute("aria-hidden", "false");

  requestAnimationFrame(() => {
    experimentWindow.classList.add("is-open");
  });
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
  const skipLaunchTransition = app.id === "pog-exe";

  if (!skipLaunchTransition) {
    if (launchLabel) {
      launchLabel.textContent = `OPENING ${app.label}...`;
    }

    if (transition) {
      transition.hidden = false;
      transition.setAttribute("aria-hidden", "false");
      requestAnimationFrame(() => transition.classList.add("is-open"));
    }

    await new Promise((resolve) => window.setTimeout(resolve, LAUNCH_DELAY));
  }
  /* GTC POG RETURN MARKER V3 START */
  if (app.id === "pog-exe") {
    try {
      sessionStorage.setItem("gtc:pog-return-pending", "1");
    } catch {
      /* Boot return also has URL/referrer fallbacks. */
    }
  }
  /* GTC POG RETURN MARKER V3 END */

  window.location.href = app.url;
}

function installShortcut(shortcut, app) {
  const rememberedPosition = readPosition(shortcut);
  shortcut._savedDesktopPosition = { ...rememberedPosition };
  renderShortcut(shortcut, rememberedPosition);

  if (!isTouch) {
    const existingShortcuts = [...document.querySelectorAll(".desktop-shortcut")]
      .filter((other) => other !== shortcut && other._savedDesktopPosition);
    const savedPositionOverlaps = existingShortcuts.some((other) =>
      overlaps(
        shortcut,
        rememberedPosition,
        other,
        other._savedDesktopPosition
      )
    );

    if (savedPositionOverlaps) {
      const recoveredPosition = findAvailablePosition(
        shortcut,
        shortcut._desktopPosition
      );
      renderShortcut(shortcut, recoveredPosition);
      shortcut._savedDesktopPosition = { ...recoveredPosition };
      writePosition(shortcut, recoveredPosition);
    }
  }

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

    const requestedPosition = {
      x: clamp(dragging.origin.x + dx, EDGE, maxX),
      y: clamp(dragging.origin.y + dy, EDGE, maxY)
    };

    renderShortcut(
      shortcut,
      findAvailablePosition(shortcut, requestedPosition)
    );
  });

  const finishPointer = (event) => {
    if (!dragging || dragging.shortcut !== shortcut) return;

    const moved = dragging.moved;
    shortcut.releasePointerCapture?.(event.pointerId);
    const cancelled = event.type === "pointercancel";

    if (moved && cancelled) {
      renderShortcut(shortcut, dragging.origin);
    } else if (moved) {
      const settledPosition = findAvailablePosition(
        shortcut,
        shortcut._desktopPosition
      );

      renderShortcut(shortcut, settledPosition);
      shortcut._savedDesktopPosition = { ...settledPosition };
      writePosition(shortcut, settledPosition);
    }

    dragging = null;

    if (!moved && isTouch) {
      openShortcut(shortcut, app);
    }
  };

  shortcut.addEventListener("pointerup", finishPointer);
  shortcut.addEventListener("pointercancel", finishPointer);

  shortcut.addEventListener("dblclick", (event) => {
    event.preventDefault();

    if (!isTouch && !dragging) {
      openShortcut(shortcut, app);
    }
  });

  shortcut.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openShortcut(shortcut, app);
    }
  });
}

function setupFolderWindow(folderWindow) {
  const chrome = folderWindow.querySelector(".folder-window__chrome");
  const resizeHandles = [...folderWindow.querySelectorAll("[data-resize]")];

  folderWindow
    .querySelector("[data-close-folder]")
    ?.addEventListener("click", () => closeFolderWindow(folderWindow));

  folderWindow.addEventListener("pointerdown", (event) => {
    if (!event.target.closest(".app-list__row")) {
      clearFolderSelection(folderWindow);
    }
  });

  resizeHandles.forEach((handle) => {
    handle.addEventListener("pointerdown", (event) => {
      event.preventDefault();

      materializeFolderPosition(folderWindow);
      const rect = folderWindow.getBoundingClientRect();

      folderResizing = {
        folderWindow,
        direction: handle.dataset.resize,
        start: { x: event.clientX, y: event.clientY },
        rect
      };

      handle.setPointerCapture?.(event.pointerId);
    });
  });

  chrome?.addEventListener("pointerdown", (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    if (event.target.closest("button")) return;

    materializeFolderPosition(folderWindow);
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

      folderWindow.style.left = `${clamp(
        start.left + moveEvent.clientX - start.x,
        0,
        maxLeft
      )}px`;

      folderWindow.style.top = `${clamp(
        start.top + moveEvent.clientY - start.y,
        0,
        maxTop
      )}px`;
    };

    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  });
}

desktop?.addEventListener("pointerdown", (event) => {
  if (event.target === desktop || event.target === appsHost) {
    clearSelection();
  }
});

window.addEventListener("resize", () => {
  document.querySelectorAll(".desktop-shortcut").forEach((shortcut) => {
    /*
      Clamp visually for the current viewport, but always start from
      the saved coordinate and never overwrite that saved coordinate.
    */
    renderShortcut(shortcut, readPosition(shortcut));
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

folderWindows.forEach(setupFolderWindow);

experimentWindow
  ?.querySelector("[data-close-experiment]")
  ?.addEventListener("click", closeExperimentWindow);

document.querySelectorAll("[data-app-link]").forEach((link) => {
  const openLinkedApp = (event) => {
    event.preventDefault();

    openExperimentWindow(
      link.href,
      link.dataset.label || link.textContent.trim()
    );
  };

  link.addEventListener("click", (event) => {
    const parentFolder =
      link.closest("[data-folder-window]") || document;

    clearFolderSelection(parentFolder);
    link.classList.add("is-selected");

    if (isTouch) {
      openLinkedApp(event);
    } else {
      event.preventDefault();
    }
  });

  link.addEventListener("dblclick", (event) => {
    if (!isTouch) {
      openLinkedApp(event);
    }
  });

  link.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      openLinkedApp(event);
    }
  });

  link.addEventListener("dragstart", (event) => {
    event.preventDefault();
  });
});

window.addEventListener("pointermove", (event) => {
  if (!folderResizing) return;

  const {
    folderWindow,
    direction,
    start,
    rect
  } = folderResizing;

  const dx = event.clientX - start.x;
  const dy = event.clientY - start.y;

  const minWidth = 420;
  const minHeight = 220;

  let left = rect.left;
  let top = rect.top;
  let width = rect.width;
  let height = rect.height;

  if (direction.includes("e")) {
    width = clamp(rect.width + dx, minWidth, window.innerWidth - left);
  }

  if (direction.includes("s")) {
    height = clamp(rect.height + dy, minHeight, window.innerHeight - top);
  }

  if (direction.includes("w")) {
    left = clamp(rect.left + dx, 0, rect.right - minWidth);
    width = rect.right - left;
  }

  if (direction.includes("n")) {
    top = clamp(rect.top + dy, 0, rect.bottom - minHeight);
    height = rect.bottom - top;
  }

  folderWindow.style.left = `${left}px`;
  folderWindow.style.top = `${top}px`;
  folderWindow.style.width = `${width}px`;
  folderWindow.style.height = `${height}px`;
});

const finishResize = () => {
  folderResizing = null;
};

window.addEventListener("pointerup", finishResize);
window.addEventListener("pointercancel", finishResize);

window.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;

  if (experimentWindow && !experimentWindow.hidden) {
    closeExperimentWindow();
    return;
  }

  const openFolder = folderWindows.find(
    (folderWindow) => !folderWindow.hidden
  );

  if (openFolder) {
    closeFolderWindow(openFolder);
  }
});

buildApps();
