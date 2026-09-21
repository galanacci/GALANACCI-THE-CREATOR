const ARCHIVE_MANIFEST = "./archive/everydays.json";
const DEMO_MANIFEST = "./demo/everydays.json";

const mosaic = document.getElementById("mosaic");
const grid = document.getElementById("mosaic-grid");
const preview = document.getElementById("preview");
const previewImage = document.getElementById("preview-image");
const status = document.getElementById("status");

const imageSlider = document.getElementById("image-slider");
const scrubber = document.getElementById("scrubber");
const imageCurrent = document.getElementById("image-current");
const imageTotal = document.getElementById("image-total");

const coarsePointer = window.matchMedia("(hover: none), (pointer: coarse)").matches;

let manifestUrl = null;
let items = [];
let activeTile = null;
let activeIndex = -1;
let previewToken = 0;
let resizeRaf = 0;

const previewCache = new Map();
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const pad = (value, digits) => String(value).padStart(digits, "0");

function resolveAsset(path) {
  return new URL(path, manifestUrl).href;
}

async function loadManifest() {
  for (const path of [ARCHIVE_MANIFEST, DEMO_MANIFEST]) {
    try {
      const url = new URL(path, window.location.href);
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data.items) || data.items.length === 0) {
        throw new Error("Manifest contains no images.");
      }
      manifestUrl = url;
      return data.items;
    } catch (error) {
      if (path === DEMO_MANIFEST) throw error;
    }
  }
  throw new Error("No EVERYDAYS manifest found.");
}

function chooseGrid(count) {
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  const screenAspect = width / height;
  const idealColumns = Math.sqrt(count * screenAspect);
  let best = null;

  const start = Math.max(1, Math.floor(idealColumns) - 8);
  const end = Math.max(start, Math.ceil(idealColumns) + 8);

  for (let columns = start; columns <= end; columns += 1) {
    const rows = Math.ceil(count / columns);
    const tileWidth = width / columns;
    const tileHeight = height / rows;
    const squarePenalty = Math.abs(Math.log(tileWidth / tileHeight));
    const emptyPenalty = ((columns * rows) - count) / Math.max(1, count);
    const score = squarePenalty + emptyPenalty * .22;

    if (!best || score < best.score) {
      best = { columns, rows, score };
    }
  }

  return best || { columns: 1, rows: count };
}

function applyGridGeometry() {
  if (!items.length) return;
  const { columns, rows } = chooseGrid(items.length);
  grid.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
  grid.style.gridTemplateRows = `repeat(${rows}, minmax(0, 1fr))`;
}

function preloadPreview(index) {
  const item = items[index];
  if (!item?.preview) return Promise.resolve(null);

  const src = resolveAsset(item.preview);
  if (previewCache.has(src)) return previewCache.get(src);

  const promise = new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });

  previewCache.set(src, promise);
  return promise;
}

function createTile(item, index) {
  const tile = document.createElement("div");
  tile.className = "tile";
  tile.dataset.index = String(index);
  tile.setAttribute("role", "img");
  tile.setAttribute("aria-label", item.title || `EVERYDAYS image ${index + 1}`);

  const image = document.createElement("img");
  image.src = resolveAsset(item.grid);
  image.alt = "";
  image.decoding = "async";
  image.draggable = false;

  tile.appendChild(image);

  tile.addEventListener("pointerenter", (event) => {
    if (event.pointerType === "mouse") {
      activateTile(tile, index);
    }
  });

  tile.addEventListener("pointermove", (event) => {
    if (event.pointerType === "mouse") {
      activateTile(tile, index);
    }
  });

  return tile;
}

function renderGrid() {
  const fragment = document.createDocumentFragment();
  items.forEach((item, index) => fragment.appendChild(createTile(item, index)));
  grid.replaceChildren(fragment);
  applyGridGeometry();
}

function updateNavigatorControl(index = activeIndex >= 0 ? activeIndex : 0) {
  if (!imageSlider || !imageCurrent || !imageTotal || !items.length) return;

  const safeIndex = clamp(index, 0, items.length - 1);
  const digits = Math.max(3, String(items.length).length);

  imageSlider.max = String(items.length);
  imageSlider.value = String(safeIndex + 1);
  imageCurrent.textContent = pad(safeIndex + 1, digits);
  imageTotal.textContent = pad(items.length, digits);
}

function activateBySliderIndex(index) {
  if (!items.length) return;

  const safeIndex = clamp(index, 0, items.length - 1);
  updateNavigatorControl(safeIndex);

  const tile = grid.querySelector(`[data-index="${safeIndex}"]`);
  if (tile) {
    activateTile(tile, safeIndex);
  }
}

function bindImageNavigator() {
  if (!imageSlider || !scrubber) return;

  const stopScrubberEvent = (event) => {
    event.stopPropagation();
  };

  [scrubber, imageSlider].forEach((element) => {
    element.addEventListener("pointerdown", stopScrubberEvent);
    element.addEventListener("pointermove", stopScrubberEvent);
    element.addEventListener("pointerup", stopScrubberEvent);
    element.addEventListener("pointercancel", stopScrubberEvent);
    element.addEventListener("click", stopScrubberEvent);
  });

  imageSlider.addEventListener("pointerdown", () => {
    scrubber.classList.add("is-scrubbing");
  });

  imageSlider.addEventListener("input", () => {
    activateBySliderIndex(Number(imageSlider.value) - 1);
  });

  imageSlider.addEventListener("change", () => {
    activateBySliderIndex(Number(imageSlider.value) - 1);
    scrubber.classList.remove("is-scrubbing");
  });

  imageSlider.addEventListener("pointerup", () => {
    activateBySliderIndex(Number(imageSlider.value) - 1);
    scrubber.classList.remove("is-scrubbing");
  });

  imageSlider.addEventListener("pointercancel", () => {
    scrubber.classList.remove("is-scrubbing");
  });
}

function calculatePreviewRect(tile, item) {
  const rect = tile.getBoundingClientRect();
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const margin = coarsePointer ? 12 : 18;

  const aspect =
    Number(item.width) > 0 && Number(item.height) > 0
      ? Number(item.width) / Number(item.height)
      : 1;

  const maxW = coarsePointer
    ? Math.min(viewportW * .56, 280)
    : Math.min(viewportW * .29, 360);

  const maxH = coarsePointer
    ? Math.min(viewportH * .38, 300)
    : Math.min(viewportH * .43, 390);

  let width = maxW;
  let height = width / aspect;

  if (height > maxH) {
    height = maxH;
    width = height * aspect;
  }

  width = Math.max(width, Math.min(118, viewportW * .28));
  height = Math.max(height, Math.min(118, viewportH * .22));

  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  let left = clamp(centerX - width / 2, margin, Math.max(margin, viewportW - width - margin));
  let top = clamp(centerY - height / 2, margin, Math.max(margin, viewportH - height - margin));

  const fromScale = clamp(
    Math.min(
      rect.width / Math.max(1, width),
      rect.height / Math.max(1, height)
    ),
    .08,
    .75
  );

  return { left, top, width, height, fromScale };
}

async function activateTile(tile, index) {
  if (!tile || index < 0 || index >= items.length) return;
  if (activeTile === tile && activeIndex === index) return;

  activeTile?.classList.remove("is-active");
  activeTile = tile;
  activeIndex = index;
  tile.classList.add("is-active");
  updateNavigatorControl(index);

  const item = items[index];
  const rect = calculatePreviewRect(tile, item);
  const token = ++previewToken;

  preview.classList.add("is-visible", "is-entering");
  preview.classList.remove("is-active");

  preview.style.left = `${rect.left}px`;
  preview.style.top = `${rect.top}px`;
  preview.style.width = `${rect.width}px`;
  preview.style.height = `${rect.height}px`;
  preview.style.setProperty("--preview-from-scale", rect.fromScale);

  previewImage.src = resolveAsset(item.grid);
  previewImage.alt = item.title || `EVERYDAYS image ${index + 1}`;

  requestAnimationFrame(() => {
    if (token !== previewToken) return;
    preview.classList.remove("is-entering");

    requestAnimationFrame(() => {
      if (token !== previewToken) return;
      preview.classList.add("is-active");
    });
  });

  try {
    const highRes = await preloadPreview(index);
    if (token !== previewToken || activeIndex !== index || !highRes) return;
    previewImage.src = highRes.src;
  } catch {
    // Keep using the lightweight mosaic derivative.
  }
}

function clearPreview() {
  activeTile?.classList.remove("is-active");
  activeTile = null;
  activeIndex = -1;
  previewToken += 1;
  preview.classList.remove("is-active", "is-entering", "is-visible");
  previewImage.removeAttribute("src");
}

function tileFromPoint(x, y) {
  const element = document.elementFromPoint(x, y);
  return element?.closest?.(".tile") || null;
}

mosaic.addEventListener("pointerleave", (event) => {
  if (event.pointerType === "mouse") clearPreview();
});

mosaic.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "mouse") return;

  event.preventDefault();
  mosaic.setPointerCapture?.(event.pointerId);

  const tile = tileFromPoint(event.clientX, event.clientY);
  if (tile) activateTile(tile, Number(tile.dataset.index));
});

mosaic.addEventListener("pointermove", (event) => {
  if (event.pointerType === "mouse") return;
  if (!(event.buttons & 1) && event.pointerType !== "touch") return;

  event.preventDefault();
  const tile = tileFromPoint(event.clientX, event.clientY);
  if (tile) activateTile(tile, Number(tile.dataset.index));
});

function finishTouch(event) {
  if (event.pointerType === "mouse") return;
  mosaic.releasePointerCapture?.(event.pointerId);
  window.setTimeout(clearPreview, 90);
}

mosaic.addEventListener("pointerup", finishTouch);
mosaic.addEventListener("pointercancel", finishTouch);

window.addEventListener("resize", () => {
  cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(() => {
    applyGridGeometry();
    if (activeTile && activeIndex >= 0) {
      const item = items[activeIndex];
      const rect = calculatePreviewRect(activeTile, item);
      preview.style.left = `${rect.left}px`;
      preview.style.top = `${rect.top}px`;
      preview.style.width = `${rect.width}px`;
      preview.style.height = `${rect.height}px`;
    }
  });
});

async function init() {
  try {
    items = await loadManifest();
    renderGrid();
    updateNavigatorControl(0);
    bindImageNavigator();

    const warm = () => {
      const limit = Math.min(items.length, 10);
      for (let index = 0; index < limit; index += 1) {
        preloadPreview(index).catch(() => {});
      }
    };

    if ("requestIdleCallback" in window) {
      requestIdleCallback(warm, { timeout: 900 });
    } else {
      setTimeout(warm, 250);
    }
  } catch (error) {
    console.error(error);
    status.textContent = "EVERYDAYS ARCHIVE COULD NOT BE LOADED.";
  }
}

init();
