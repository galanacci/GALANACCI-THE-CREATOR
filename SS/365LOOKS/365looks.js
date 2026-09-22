const MANIFEST_URL = "./archive/365looks.json";

const LOOK_COUNT = 365;
const GRID_COLUMNS = 25;
const GRID_ROWS = 15;
const FULL_ROWS = 14;
const LAST_ROW_COUNT = 15;
const LAST_ROW_OFFSET = 5;

const MIN_ZOOM = 1;
const MAX_ZOOM = 32;
const ZOOM_EASE = .17;
const FOCUS_EASE = .2;
const DPR_CAP = 2;
const TILE_CACHE_LIMIT = 48;

const viewer = document.getElementById("viewer");
const canvas = document.getElementById("look-canvas");
const ctx = canvas.getContext("2d", { alpha: false });
const navigator = document.getElementById("navigator");
const navigatorImage = document.getElementById("navigator-image");
const navigatorWindow = document.getElementById("navigator-window");
const slider = document.getElementById("look-slider");
const currentLabel = document.getElementById("look-current");
const totalLabel = document.getElementById("look-total");
const scrubber = document.getElementById("scrubber");
const status = document.getElementById("status");

let manifestUrl = null;
let archive = null;
let overview = null;

let zoom = 1;
let targetZoom = 1;
let focusX = .5;
let focusY = .5;
let targetFocusX = .5;
let targetFocusY = .5;

let currentLook = 0;
let renderRaf = 0;
let lastGeometry = null;

let dragging = false;
let dragPointerId = null;
let dragStartX = 0;
let dragStartY = 0;
let dragStartFocusX = .5;
let dragStartFocusY = .5;

const pointers = new Map();
let pinchStartDistance = 0;
let pinchStartZoom = 1;

const tileCache = new Map();

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const pad3 = (value) => String(value).padStart(3, "0");

function resolveAsset(path) {
  return new URL(path, manifestUrl).href;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

async function loadManifest() {
  const url = new URL(MANIFEST_URL, window.location.href);
  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`Manifest HTTP ${response.status}`);
  }

  const data = await response.json();

  if (
    !Number.isFinite(data.width) ||
    !Number.isFinite(data.height) ||
    !Number.isFinite(data.tile_size) ||
    !Number.isFinite(data.cols) ||
    !Number.isFinite(data.rows)
  ) {
    throw new Error("365 LOOKS manifest is invalid.");
  }

  manifestUrl = url;
  return data;
}

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
  const width = Math.max(1, viewer.clientWidth);
  const height = Math.max(1, viewer.clientHeight);
  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(height * dpr);

  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { width, height, dpr };
}

function getGeometry(z = zoom, fx = focusX, fy = focusY) {
  const { width: viewportWidth, height: viewportHeight } = resizeCanvas();

  const fitScale = Math.min(
    viewportWidth / archive.width,
    viewportHeight / archive.height
  );

  const scaledWidth = archive.width * fitScale * z;
  const scaledHeight = archive.height * fitScale * z;

  let drawX;
  let drawY;

  if (scaledWidth <= viewportWidth) {
    drawX = (viewportWidth - scaledWidth) / 2;
  } else {
    drawX = viewportWidth / 2 - fx * scaledWidth;
    drawX = clamp(drawX, viewportWidth - scaledWidth, 0);
  }

  if (scaledHeight <= viewportHeight) {
    drawY = (viewportHeight - scaledHeight) / 2;
  } else {
    drawY = viewportHeight / 2 - fy * scaledHeight;
    drawY = clamp(drawY, viewportHeight - scaledHeight, 0);
  }

  return {
    viewportWidth,
    viewportHeight,
    fitScale,
    scaledWidth,
    scaledHeight,
    drawX,
    drawY
  };
}

function drawOverview(geometry) {
  if (!overview) return;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  ctx.drawImage(
    overview,
    geometry.drawX,
    geometry.drawY,
    geometry.scaledWidth,
    geometry.scaledHeight
  );
}

function tilePath(col, row) {
  return resolveAsset(`${archive.tiles}/${col}_${row}.jpg`);
}

function loadTile(col, row) {
  const key = `${col}_${row}`;

  if (tileCache.has(key)) {
    const item = tileCache.get(key);
    item.lastUsed = performance.now();
    return item.promise;
  }

  const promise = loadImage(tilePath(col, row))
    .catch((error) => {
      tileCache.delete(key);
      throw error;
    });

  tileCache.set(key, {
    promise,
    lastUsed: performance.now()
  });

  if (tileCache.size > TILE_CACHE_LIMIT) {
    const entries = [...tileCache.entries()]
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed);

    const removeCount = tileCache.size - TILE_CACHE_LIMIT;

    for (let i = 0; i < removeCount; i += 1) {
      tileCache.delete(entries[i][0]);
    }
  }

  return promise;
}

function visibleTileRange(geometry) {
  const visibleLeftPx = clamp(-geometry.drawX, 0, geometry.scaledWidth);
  const visibleTopPx = clamp(-geometry.drawY, 0, geometry.scaledHeight);
  const visibleRightPx = clamp(
    geometry.viewportWidth - geometry.drawX,
    0,
    geometry.scaledWidth
  );
  const visibleBottomPx = clamp(
    geometry.viewportHeight - geometry.drawY,
    0,
    geometry.scaledHeight
  );

  const sourceLeft =
    (visibleLeftPx / geometry.scaledWidth) * archive.width;
  const sourceTop =
    (visibleTopPx / geometry.scaledHeight) * archive.height;
  const sourceRight =
    (visibleRightPx / geometry.scaledWidth) * archive.width;
  const sourceBottom =
    (visibleBottomPx / geometry.scaledHeight) * archive.height;

  return {
    minCol: clamp(
      Math.floor(sourceLeft / archive.tile_size),
      0,
      archive.cols - 1
    ),
    maxCol: clamp(
      Math.floor(Math.max(0, sourceRight - 1) / archive.tile_size),
      0,
      archive.cols - 1
    ),
    minRow: clamp(
      Math.floor(sourceTop / archive.tile_size),
      0,
      archive.rows - 1
    ),
    maxRow: clamp(
      Math.floor(Math.max(0, sourceBottom - 1) / archive.tile_size),
      0,
      archive.rows - 1
    )
  };
}

function drawLoadedTiles(geometry) {
  if (zoom < 1.5) return;

  const range = visibleTileRange(geometry);

  for (let row = range.minRow; row <= range.maxRow; row += 1) {
    for (let col = range.minCol; col <= range.maxCol; col += 1) {
      const tileX = col * archive.tile_size;
      const tileY = row * archive.tile_size;
      const tileWidth = Math.min(
        archive.tile_size,
        archive.width - tileX
      );
      const tileHeight = Math.min(
        archive.tile_size,
        archive.height - tileY
      );

      const screenX =
        geometry.drawX +
        (tileX / archive.width) * geometry.scaledWidth;

      const screenY =
        geometry.drawY +
        (tileY / archive.height) * geometry.scaledHeight;

      const screenWidth =
        (tileWidth / archive.width) * geometry.scaledWidth;

      const screenHeight =
        (tileHeight / archive.height) * geometry.scaledHeight;

      const key = `${col}_${row}`;
      const cached = tileCache.get(key);

      if (cached?.image) {
        ctx.drawImage(
          cached.image,
          screenX,
          screenY,
          screenWidth,
          screenHeight
        );
        cached.lastUsed = performance.now();
        continue;
      }

      loadTile(col, row)
        .then((image) => {
          const current = tileCache.get(key);
          if (current) current.image = image;
          scheduleRender();
        })
        .catch(() => {});
    }
  }
}

function updateNavigator(geometry) {
  let left = 0;
  let top = 0;
  let width = 1;
  let height = 1;

  if (geometry.scaledWidth > geometry.viewportWidth) {
    left = clamp(-geometry.drawX / geometry.scaledWidth, 0, 1);
    width = clamp(
      geometry.viewportWidth / geometry.scaledWidth,
      0,
      1
    );
  }

  if (geometry.scaledHeight > geometry.viewportHeight) {
    top = clamp(-geometry.drawY / geometry.scaledHeight, 0, 1);
    height = clamp(
      geometry.viewportHeight / geometry.scaledHeight,
      0,
      1
    );
  }

  navigatorWindow.style.left = `${left * 100}%`;
  navigatorWindow.style.top = `${top * 100}%`;
  navigatorWindow.style.width = `${width * 100}%`;
  navigatorWindow.style.height = `${height * 100}%`;
}

function drawFrame() {
  renderRaf = 0;
  if (!archive || !overview) return;

  zoom += (targetZoom - zoom) * ZOOM_EASE;
  focusX += (targetFocusX - focusX) * FOCUS_EASE;
  focusY += (targetFocusY - focusY) * FOCUS_EASE;

  if (Math.abs(targetZoom - zoom) < .002) zoom = targetZoom;
  if (Math.abs(targetFocusX - focusX) < .0004) focusX = targetFocusX;
  if (Math.abs(targetFocusY - focusY) < .0004) focusY = targetFocusY;

  const geometry = getGeometry();
  lastGeometry = geometry;

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, geometry.viewportWidth, geometry.viewportHeight);

  drawOverview(geometry);
  drawLoadedTiles(geometry);
  updateNavigator(geometry);

  if (
    Math.abs(targetZoom - zoom) > .002 ||
    Math.abs(targetFocusX - focusX) > .0004 ||
    Math.abs(targetFocusY - focusY) > .0004
  ) {
    scheduleRender();
  }
}

function scheduleRender() {
  if (renderRaf) return;
  renderRaf = requestAnimationFrame(drawFrame);
}

function lookCell(index) {
  index = clamp(Math.round(index), 0, LOOK_COUNT - 1);

  if (index < GRID_COLUMNS * FULL_ROWS) {
    return {
      row: Math.floor(index / GRID_COLUMNS),
      column: index % GRID_COLUMNS
    };
  }

  return {
    row: GRID_ROWS - 1,
    column: LAST_ROW_OFFSET + (index - GRID_COLUMNS * FULL_ROWS)
  };
}

function lookCenter(index) {
  const { row, column } = lookCell(index);

  return {
    x: (column + .5) / GRID_COLUMNS,
    y: (row + .5) / GRID_ROWS
  };
}

function lookZoom() {
  const { width, height } = resizeCanvas();

  const fitScale = Math.min(
    width / archive.width,
    height / archive.height
  );

  const cellWidthAtOverview =
    (archive.width / GRID_COLUMNS) * fitScale;

  const cellHeightAtOverview =
    (archive.height / GRID_ROWS) * fitScale;

  return clamp(
    Math.min(
      (width * .7) / Math.max(1, cellWidthAtOverview),
      (height * .78) / Math.max(1, cellHeightAtOverview)
    ),
    8,
    MAX_ZOOM
  );
}

function updateCounter(index) {
  currentLook = clamp(Math.round(index), 0, LOOK_COUNT - 1);
  slider.value = String(currentLook + 1);
  currentLabel.textContent = pad3(currentLook + 1);
  totalLabel.textContent = pad3(LOOK_COUNT);
}

function focusLook(index) {
  index = clamp(Math.round(index), 0, LOOK_COUNT - 1);
  const centre = lookCenter(index);

  targetZoom = lookZoom();
  targetFocusX = centre.x;
  targetFocusY = centre.y;

  updateCounter(index);
  scheduleRender();
}

function nearestLookToFocus() {
  let row = clamp(
    Math.floor(targetFocusY * GRID_ROWS),
    0,
    GRID_ROWS - 1
  );

  let column = clamp(
    Math.floor(targetFocusX * GRID_COLUMNS),
    0,
    GRID_COLUMNS - 1
  );

  if (row < FULL_ROWS) {
    return clamp(
      row * GRID_COLUMNS + column,
      0,
      GRID_COLUMNS * FULL_ROWS - 1
    );
  }

  column = clamp(
    column,
    LAST_ROW_OFFSET,
    LAST_ROW_OFFSET + LAST_ROW_COUNT - 1
  );

  return GRID_COLUMNS * FULL_ROWS + (column - LAST_ROW_OFFSET);
}

function syncLookFromFocus() {
  if (targetZoom < lookZoom() * .55) return;
  updateCounter(nearestLookToFocus());
}

function resetOverview() {
  targetZoom = 1;
  targetFocusX = .5;
  targetFocusY = .5;
  scheduleRender();
}

function normalizedImagePoint(clientX, clientY, geometry = lastGeometry) {
  if (!geometry) return { x: .5, y: .5 };

  const rect = viewer.getBoundingClientRect();
  const px = clientX - rect.left;
  const py = clientY - rect.top;

  return {
    x: clamp((px - geometry.drawX) / geometry.scaledWidth, 0, 1),
    y: clamp((py - geometry.drawY) / geometry.scaledHeight, 0, 1)
  };
}

function zoomAround(clientX, clientY, nextZoom) {
  if (!lastGeometry) return;

  const point = normalizedImagePoint(clientX, clientY, lastGeometry);
  nextZoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);

  const { width, height } = resizeCanvas();

  const fitScale = Math.min(
    width / archive.width,
    height / archive.height
  );

  const nextScaledWidth = archive.width * fitScale * nextZoom;
  const nextScaledHeight = archive.height * fitScale * nextZoom;

  const rect = viewer.getBoundingClientRect();
  const px = clientX - rect.left;
  const py = clientY - rect.top;

  let nextFocusX = point.x;
  let nextFocusY = point.y;

  if (nextScaledWidth > width) {
    nextFocusX =
      point.x - (px - width / 2) / nextScaledWidth;
  }

  if (nextScaledHeight > height) {
    nextFocusY =
      point.y - (py - height / 2) / nextScaledHeight;
  }

  targetZoom = nextZoom;
  targetFocusX = clamp(nextFocusX, 0, 1);
  targetFocusY = clamp(nextFocusY, 0, 1);

  if (targetZoom <= 1.01) {
    targetFocusX = .5;
    targetFocusY = .5;
  }

  syncLookFromFocus();
  scheduleRender();
}

canvas.addEventListener("wheel", (event) => {
  event.preventDefault();

  const factor = Math.exp(-event.deltaY * .0016);

  zoomAround(
    event.clientX,
    event.clientY,
    targetZoom * factor
  );
}, { passive: false });

canvas.addEventListener("dblclick", (event) => {
  event.preventDefault();
  resetOverview();
});

canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== undefined && event.button !== 0) return;

  pointers.set(event.pointerId, {
    x: event.clientX,
    y: event.clientY
  });

  canvas.setPointerCapture?.(event.pointerId);

  if (pointers.size === 1) {
    dragging = true;
    dragPointerId = event.pointerId;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    dragStartFocusX = targetFocusX;
    dragStartFocusY = targetFocusY;
  }

  if (pointers.size === 2) {
    const points = [...pointers.values()];

    pinchStartDistance = Math.hypot(
      points[1].x - points[0].x,
      points[1].y - points[0].y
    );

    pinchStartZoom = targetZoom;
    dragging = false;
  }
});

canvas.addEventListener("pointermove", (event) => {
  if (!pointers.has(event.pointerId)) return;

  pointers.set(event.pointerId, {
    x: event.clientX,
    y: event.clientY
  });

  if (pointers.size >= 2) {
    event.preventDefault();

    const points = [...pointers.values()].slice(0, 2);

    const distance = Math.hypot(
      points[1].x - points[0].x,
      points[1].y - points[0].y
    );

    const midpointX = (points[0].x + points[1].x) / 2;
    const midpointY = (points[0].y + points[1].y) / 2;

    const nextZoom =
      pinchStartDistance > 0
        ? pinchStartZoom * (distance / pinchStartDistance)
        : targetZoom;

    zoomAround(midpointX, midpointY, nextZoom);
    return;
  }

  if (!dragging || dragPointerId !== event.pointerId) return;

  event.preventDefault();

  const geometry = lastGeometry || getGeometry(
    targetZoom,
    targetFocusX,
    targetFocusY
  );

  if (
    geometry.scaledWidth <= geometry.viewportWidth &&
    geometry.scaledHeight <= geometry.viewportHeight
  ) {
    return;
  }

  const dx = event.clientX - dragStartX;
  const dy = event.clientY - dragStartY;

  targetFocusX = clamp(
    dragStartFocusX - dx / Math.max(1, geometry.scaledWidth),
    0,
    1
  );

  targetFocusY = clamp(
    dragStartFocusY - dy / Math.max(1, geometry.scaledHeight),
    0,
    1
  );

  syncLookFromFocus();
  scheduleRender();
});

function endPointer(event) {
  pointers.delete(event.pointerId);
  canvas.releasePointerCapture?.(event.pointerId);

  if (dragPointerId === event.pointerId) {
    dragging = false;
    dragPointerId = null;
  }

  if (pointers.size === 1) {
    const [remainingId, remaining] = [...pointers.entries()][0];

    dragging = true;
    dragPointerId = remainingId;
    dragStartX = remaining.x;
    dragStartY = remaining.y;
    dragStartFocusX = targetFocusX;
    dragStartFocusY = targetFocusY;
  }

  if (pointers.size < 2) {
    pinchStartDistance = 0;
  }

  syncLookFromFocus();
}

canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);

slider.addEventListener("pointerdown", (event) => {
  event.stopPropagation();
  scrubber.classList.add("is-scrubbing");
});

slider.addEventListener("input", (event) => {
  event.stopPropagation();
  focusLook(Number(slider.value) - 1);
});

slider.addEventListener("change", () => {
  focusLook(Number(slider.value) - 1);
  scrubber.classList.remove("is-scrubbing");
});

slider.addEventListener("pointerup", () => {
  scrubber.classList.remove("is-scrubbing");
});

slider.addEventListener("pointercancel", () => {
  scrubber.classList.remove("is-scrubbing");
});

navigator.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  event.stopPropagation();

  const rect = navigator.getBoundingClientRect();

  targetFocusX = clamp(
    (event.clientX - rect.left) / Math.max(1, rect.width),
    0,
    1
  );

  targetFocusY = clamp(
    (event.clientY - rect.top) / Math.max(1, rect.height),
    0,
    1
  );

  if (targetZoom <= 1.01) {
    targetZoom = lookZoom();
  }

  syncLookFromFocus();
  scheduleRender();
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" || event.key === "0") {
    resetOverview();
    return;
  }

  if (event.key === "ArrowLeft") {
    focusLook(currentLook - 1);
  }

  if (event.key === "ArrowRight") {
    focusLook(currentLook + 1);
  }
});

window.addEventListener("resize", scheduleRender, { passive: true });

async function init() {
  try {
    archive = await loadManifest();

    navigator.style.setProperty(
      "--nav-aspect",
      `${archive.width} / ${archive.height}`
    );

    overview = await loadImage(resolveAsset(archive.overview));

    navigatorImage.src = overview.src;
    updateCounter(0);

    viewer.classList.add("is-ready");
    status.textContent = "";

    scheduleRender();
  } catch (error) {
    console.error(error);
    status.textContent = "365 LOOKS ARCHIVE COULD NOT BE LOADED.";
  }
}

init();
