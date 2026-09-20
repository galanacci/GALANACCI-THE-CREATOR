const ARCHIVE_MANIFEST = "./archive/book.json";
const DEMO_MANIFEST = "./demo/book.json";

const PRELOAD_RADIUS = 3;
const MAX_FULL_CACHE = 18;

const DRAG_START_PX = 7;
const TURN_THRESHOLD = 0.34;
const VELOCITY_THRESHOLD = 0.62;
const CLICK_MAX_PX = 7;
const CLICK_MAX_MS = 260;

// The static page remains the full-resolution <img>. During a turn we cap
// the GPU texture resolution slightly on high-DPI phones to keep 60fps.
const GPU_DPR_CAP = 1.6;

// A real sheet does not vanish the instant the turn reaches 100%.
// After the main curl, V9 lets the old page continue a short distance past
// the spine before the renderer is cleared.
const FORWARD_SETTLE_PROGRESS = 1.16;

const currentPage = document.getElementById("current-page");
const currentImage = document.getElementById("current-image");
const underImage = document.getElementById("under-image");
const curlCanvas = document.getElementById("page-curl");

const slider = document.getElementById("page-slider");
const scrubber = document.getElementById("scrubber");
const pageCurrent = document.getElementById("page-current");
const pageTotal = document.getElementById("page-total");
const status = document.getElementById("status");
const stage = document.getElementById("book-stage");

let pages = [];
let currentIndex = 0;
let manifestUrl = null;
let turning = false;
let drag = null;
let scrubIndex = null;
let scrubRaf = 0;

let activeDirection = null;
let activeTargetIndex = null;
let requestedDragProgress = null;
let dragRenderRaf = 0;

const fullCache = new Map();
const thumbCache = new Map();

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const pad = (value, digits) => String(value).padStart(digits, "0");

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutCubic(t) {
  return t < .5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function resolveAsset(path) {
  return new URL(path, manifestUrl).href;
}

async function loadManifest() {
  for (const path of [ARCHIVE_MANIFEST, DEMO_MANIFEST]) {
    try {
      const absolute = new URL(path, window.location.href);
      const response = await fetch(absolute, { cache: "no-store" });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();

      if (!Array.isArray(data.pages) || data.pages.length === 0) {
        throw new Error("Manifest contains no pages.");
      }

      manifestUrl = absolute;
      return data;
    } catch (error) {
      if (path === DEMO_MANIFEST) throw error;
    }
  }

  throw new Error("No archive manifest found.");
}

function sourceFor(index, kind = "full") {
  const page = pages[index];
  if (!page) return null;

  if (kind === "thumb" && page.thumbnail) {
    return resolveAsset(page.thumbnail);
  }

  return resolveAsset(page.image);
}

function loadImage(index, kind = "full") {
  if (index < 0 || index >= pages.length) {
    return Promise.resolve(null);
  }

  const src = sourceFor(index, kind);
  const cache = kind === "thumb" ? thumbCache : fullCache;

  if (cache.has(src)) return cache.get(src);

  const promise = new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });

  cache.set(src, promise);
  return promise;
}

function warmAround(index) {
  for (let offset = -PRELOAD_RADIUS; offset <= PRELOAD_RADIUS; offset += 1) {
    loadImage(index + offset, "full").catch(() => {});
    loadImage(index + offset, "thumb").catch(() => {});
  }

  if (fullCache.size > MAX_FULL_CACHE) {
    const keep = new Set();

    for (let offset = -6; offset <= 6; offset += 1) {
      const i = index + offset;
      if (i >= 0 && i < pages.length) keep.add(sourceFor(i, "full"));
    }

    for (const key of fullCache.keys()) {
      if (!keep.has(key)) fullCache.delete(key);
    }
  }
}

function idleWarmThumbnails() {
  let index = 0;

  const step = (deadline) => {
    let batch = 7;

    while (index < pages.length && batch > 0) {
      loadImage(index, "thumb").catch(() => {});
      index += 1;
      batch -= 1;

      if (deadline?.timeRemaining && deadline.timeRemaining() < 3) break;
    }

    if (index < pages.length) {
      if ("requestIdleCallback" in window) {
        requestIdleCallback(step, { timeout: 700 });
      } else {
        setTimeout(() => step(null), 70);
      }
    }
  };

  if ("requestIdleCallback" in window) {
    requestIdleCallback(step, { timeout: 700 });
  } else {
    setTimeout(() => step(null), 150);
  }
}

function updateControls(index = currentIndex) {
  const digits = Math.max(3, String(pages.length).length);

  slider.max = String(pages.length);
  slider.value = String(index + 1);
  pageCurrent.textContent = pad(index + 1, digits);
  pageTotal.textContent = pad(pages.length, digits);
}

/* -------------------------------------------------------------------------- */
/* GPU PAGE CURL                                                              */
/* -------------------------------------------------------------------------- */

class SmoothPageCurl {
  constructor(canvas) {
    this.canvas = canvas;

    this.gl =
      canvas.getContext("webgl", {
        alpha: true,
        antialias: true,
        premultipliedAlpha: false,
        preserveDrawingBuffer: false,
        powerPreference: "high-performance"
      }) ||
      canvas.getContext("experimental-webgl");

    this.ready = false;
    this.texture = null;
    this.viewport = { width: 1, height: 1, dpr: 1 };

    if (!this.gl) return;

    try {
      this.init();
      this.ready = true;
    } catch (error) {
      console.warn("BLACKBOOK GPU curl unavailable:", error);
      this.ready = false;
    }
  }

  init() {
    const gl = this.gl;

    const vertexSource = `
      precision highp float;

      attribute vec2 a_uv;

      uniform float u_progress;

      varying vec2 v_uv;
      varying float v_facing;
      varying float v_crest;
      varying float v_depth;

      const float PI = 3.141592653589793;

      void main() {
        float rawP = clamp(u_progress, 0.0, 1.16);
        float p = min(rawP, 1.0);
        float exitT = smoothstep(1.0, 1.16, rawP);

        float u = a_uv.x;
        float v = a_uv.y;

        // A tiny vertical bias keeps the fold from looking mechanically perfect.
        // It is continuous across the mesh, so there are no visible slices.
        float diagonal =
          (v - 0.5) *
          0.026 *
          sin(p * PI);

        float fold = clamp(1.0 - p + diagonal, 0.0, 1.0);

        float x = u;
        float z = 0.0;
        float facing = 1.0;
        float crest = 0.0;

        if (p > 0.00001 && u > fold) {
          float curlLength = max(0.0001, 1.0 - fold);
          float local = clamp((u - fold) / curlLength, 0.0, 1.0);

          // As the page travels farther, it wraps beyond half a cylinder.
          // This lets the outside edge disappear naturally past the spine.
          float span = mix(PI * 1.08, PI * 1.58, smoothstep(0.0, 1.0, p));
          float theta = local * span;
          float radius = curlLength / span;

          x = fold + radius * sin(theta);
          z = radius * (1.0 - cos(theta));

          facing = cos(theta);
          crest = 1.0 - abs(facing);
        }

        // Once the main curl has completed, let the already-curled sheet pass
        // naturally beyond the left/spine edge. This is the missing physical
        // follow-through that previously made the old page abruptly disappear.
        x -= exitT * 0.42;

        // The sheet also settles slightly deeper as it passes behind the spine.
        z += exitT * 0.035;

        // Mild depth perspective; enough to make the fold dimensional without
        // turning the page into a dramatic 3D object.
        float perspective = 1.0 / (1.0 + z * 0.72);

        float clipX = (x * 2.0 - 1.0) * perspective;
        float clipY = (v * 2.0 - 1.0) * (1.0 - z * 0.07);

        gl_Position = vec4(clipX, clipY, 0.0, 1.0);

        v_uv = a_uv;
        v_facing = facing;
        v_crest = crest;
        v_depth = z;
      }
    `;

    const fragmentSource = `
      precision mediump float;

      uniform sampler2D u_texture;

      varying vec2 v_uv;
      varying float v_facing;
      varying float v_crest;
      varying float v_depth;

      void main() {
        vec4 frontColor = texture2D(u_texture, v_uv);

        // When we see the underside of the sheet, it should not read as a fully
        // opaque front print. In a real book page you get a soft show-through:
        // the image is mirrored, lighter, lower-contrast and absorbed into the
        // white paper stock.
        float isBack = 1.0 - step(0.0, v_facing);

        vec2 backUv = vec2(1.0 - v_uv.x, v_uv.y);
        vec4 backSample = texture2D(u_texture, backUv);

        float backGray = dot(backSample.rgb, vec3(0.299, 0.587, 0.114));
        vec3 backInk = vec3(backGray);

        // Faded bleed-through on the back: mostly paper white with just a soft
        // impression of the artwork coming through.
        vec3 backPaper = vec3(1.0);
        vec3 backColor = mix(backPaper, backInk, 0.16);

        // Reduce contrast further so dark marks do not read as a full print.
        backColor = mix(backPaper, backColor, 0.78);

        vec3 color = mix(frontColor.rgb, backColor, isBack);

        // Continuous lighting across the actual mesh. Unlike the old renderer,
        // this does not paint hundreds of separate vertical rectangles.
        float shade =
          1.0
          - v_crest * 0.105
          - isBack * 0.055
          - min(v_depth * 0.11, 0.035);

        // A subtle translucency boost around the crest helps the underside feel
        // like thin paper catching light.
        float backLight = isBack * v_crest * 0.05;

        color *= shade;
        color = min(vec3(1.0), color + backLight);

        gl_FragColor = vec4(color, 1.0);
      }
    `;

    const vertexShader = this.compile(gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = this.compile(gl.FRAGMENT_SHADER, fragmentSource);

    this.program = gl.createProgram();
    gl.attachShader(this.program, vertexShader);
    gl.attachShader(this.program, fragmentShader);
    gl.linkProgram(this.program);

    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(this.program) || "WebGL link failed");
    }

    gl.useProgram(this.program);

    this.aUv = gl.getAttribLocation(this.program, "a_uv");
    this.uProgress = gl.getUniformLocation(this.program, "u_progress");
    this.uTexture = gl.getUniformLocation(this.program, "u_texture");

    // A continuous triangle mesh. The old version rendered the page as
    // independent 2D strips, which is exactly what caused the visible slicing.
    const columns = 144;
    // V7: only two vertices vertically.
    // The curl bends horizontally, so extra horizontal mesh rows are unnecessary.
    // On some browsers those row boundaries rasterised as visible white seams.
    const rows = 1;

    const vertices = [];
    const indices = [];

    for (let y = 0; y <= rows; y += 1) {
      const v = y / rows;

      for (let x = 0; x <= columns; x += 1) {
        const u = x / columns;
        vertices.push(u, v);
      }
    }

    const stride = columns + 1;

    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < columns; x += 1) {
        const a = y * stride + x;
        const b = a + 1;
        const c = a + stride;
        const d = c + 1;

        indices.push(a, b, c);
        indices.push(b, d, c);
      }
    }

    this.indexCount = indices.length;

    this.vertexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array(vertices),
      gl.STATIC_DRAW
    );

    this.indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(
      gl.ELEMENT_ARRAY_BUFFER,
      new Uint16Array(indices),
      gl.STATIC_DRAW
    );

    gl.enableVertexAttribArray(this.aUv);
    gl.vertexAttribPointer(this.aUv, 2, gl.FLOAT, false, 0, 0);

    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);

    // V7: the page texture is rendered onto an opaque white source canvas.
    // Blending is therefore unnecessary and can expose tiny triangle-edge seams
    // on some GPU/browser combinations.
    gl.disable(gl.BLEND);

    gl.uniform1i(this.uTexture, 0);

    this.resize();
  }

  compile(type, source) {
    const gl = this.gl;
    const shader = gl.createShader(type);

    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const message = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader);
      throw new Error(message || "WebGL shader compile failed");
    }

    return shader;
  }

  resize() {
    if (!this.gl) return;

    const width = Math.max(1, stage.clientWidth);
    const height = Math.max(1, stage.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, GPU_DPR_CAP);

    const pixelWidth = Math.max(1, Math.round(width * dpr));
    const pixelHeight = Math.max(1, Math.round(height * dpr));

    if (
      this.canvas.width !== pixelWidth ||
      this.canvas.height !== pixelHeight
    ) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
      this.canvas.style.width = `${width}px`;
      this.canvas.style.height = `${height}px`;
    }

    this.viewport = { width, height, dpr };

    this.gl.viewport(0, 0, pixelWidth, pixelHeight);
  }

  makeTextureSource(image) {
    this.resize();

    const { width, height, dpr } = this.viewport;
    const canvas = document.createElement("canvas");

    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));

    const ctx = canvas.getContext("2d", { alpha: false });

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);

    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    const scale = Math.min(width / sourceWidth, height / sourceHeight);

    const drawWidth = sourceWidth * scale;
    const drawHeight = sourceHeight * scale;
    const x = (width - drawWidth) / 2;
    const y = (height - drawHeight) / 2;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, x, y, drawWidth, drawHeight);

    return canvas;
  }

  setImage(image) {
    if (!this.ready) return;

    const gl = this.gl;
    const source = this.makeTextureSource(image);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);

    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      source
    );
  }

  render(progress) {
    if (!this.ready) return;

    const gl = this.gl;

    gl.useProgram(this.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);

    gl.enableVertexAttribArray(this.aUv);
    gl.vertexAttribPointer(this.aUv, 2, gl.FLOAT, false, 0, 0);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.uniform1f(this.uProgress, clamp(progress, 0, FORWARD_SETTLE_PROGRESS));

    gl.drawElements(
      gl.TRIANGLES,
      this.indexCount,
      gl.UNSIGNED_SHORT,
      0
    );
  }

  clear() {
    if (!this.ready) return;

    const gl = this.gl;
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
}

const gpuCurl = new SmoothPageCurl(curlCanvas);

/* A deliberately plain fallback for the rare browser without WebGL. */
function fallbackRender(progress) {
  const raw = clamp(progress, 0, FORWARD_SETTLE_PROGRESS);
  const p = Math.min(raw, 1);
  const tail = clamp(
    (raw - 1) / (FORWARD_SETTLE_PROGRESS - 1),
    0,
    1
  );
  const width = stage.clientWidth;

  curlCanvas.style.transformOrigin = "0 50%";
  curlCanvas.style.transform =
    `translateX(${-(p * .92 + tail * .24) * width}px) scaleX(${1 - p * .12})`;
  curlCanvas.style.opacity = "1";
}

function renderCurl(progress) {
  if (gpuCurl.ready) {
    gpuCurl.render(progress);
  } else {
    fallbackRender(progress);
  }
}

function scheduleDragRender(progress) {
  requestedDragProgress = progress;

  if (dragRenderRaf) return;

  dragRenderRaf = requestAnimationFrame(() => {
    dragRenderRaf = 0;

    if (requestedDragProgress == null) return;

    renderDragProgress(requestedDragProgress);
    requestedDragProgress = null;
  });
}

function renderDragProgress(progress) {
  if (!activeDirection) return;

  if (activeDirection === "next") {
    renderCurl(progress);
  } else {
    renderCurl(1 - progress);
  }
}

async function prepareTurn(direction) {
  const targetIndex =
    direction === "next"
      ? currentIndex + 1
      : currentIndex - 1;

  if (targetIndex < 0 || targetIndex >= pages.length) {
    return false;
  }

  const [currentLoaded, targetLoaded] = await Promise.all([
    loadImage(currentIndex, "full"),
    loadImage(targetIndex, "full")
  ]);

  activeDirection = direction;
  activeTargetIndex = targetIndex;

  if (direction === "next") {
    underImage.src = targetLoaded.src;

    if (gpuCurl.ready) {
      gpuCurl.setImage(currentLoaded);
      gpuCurl.render(0);
    }

    curlCanvas.classList.add("is-active");

    // Hide only after the GPU frame is ready to avoid a white flash.
    currentPage.classList.add("is-hidden-during-turn");
  } else {
    // The current page remains visible underneath while the previous page
    // unfolds from its already-turned state.
    underImage.src = currentLoaded.src;

    if (gpuCurl.ready) {
      gpuCurl.setImage(targetLoaded);
      gpuCurl.render(1);
    }

    curlCanvas.classList.add("is-active");
    currentPage.classList.remove("is-hidden-during-turn");
  }

  return true;
}

function resetTurnVisuals() {
  cancelAnimationFrame(dragRenderRaf);
  dragRenderRaf = 0;
  requestedDragProgress = null;

  activeDirection = null;
  activeTargetIndex = null;

  gpuCurl.clear();

  curlCanvas.style.removeProperty("transform");
  curlCanvas.style.removeProperty("opacity");
  curlCanvas.classList.remove("is-active");

  currentPage.classList.remove("is-hidden-during-turn");
}

function animateProgress(from, to, duration) {
  const start = performance.now();

  return new Promise((resolve) => {
    const frame = (now) => {
      const raw = clamp((now - start) / Math.max(1, duration), 0, 1);
      const eased =
        to > from
          ? easeOutCubic(raw)
          : easeInOutCubic(raw);

      const value = from + (to - from) * eased;

      renderDragProgress(value);

      if (raw < 1) {
        requestAnimationFrame(frame);
      } else {
        resolve();
      }
    };

    requestAnimationFrame(frame);
  });
}

async function finishTurn({ commit, progress, velocity = 0 }) {
  if (!activeDirection || activeTargetIndex == null) {
    resetTurnVisuals();
    return;
  }

  turning = true;

  try {
    if (commit) {
      const speedBoost = Math.min(.35, Math.abs(velocity) * .11);

      if (activeDirection === "next") {
        // Finish the main curl first, then let the old sheet physically pass
        // beyond the spine. The next drawing is already underneath, so the
        // reveal remains continuous throughout the whole motion.
        const mainRemaining = Math.max(0, 1 - progress);
        const mainDuration = Math.max(
          95,
          Math.round((350 - speedBoost * 190) * mainRemaining + 70)
        );

        if (progress < 1) {
          await animateProgress(progress, 1, mainDuration);
        }

        // This tiny follow-through is what prevents the old page from popping
        // out of existence at the last frame.
        await animateProgress(1, FORWARD_SETTLE_PROGRESS, 145);
      } else {
        // A previous-page turn finishes with that sheet fully flat over the
        // current page, so no off-screen tail is needed.
        const remaining = Math.max(0, 1 - progress);
        const duration = Math.max(
          100,
          Math.round((340 - speedBoost * 180) * remaining + 70)
        );

        await animateProgress(progress, 1, duration);
      }

      currentIndex = activeTargetIndex;

      const target = await loadImage(currentIndex, "full");
      currentImage.src = target.src;
      currentImage.alt =
        pages[currentIndex].title ||
        `Drawing ${currentIndex + 1}`;

      updateControls();
      warmAround(currentIndex);
    } else {
      const duration = Math.max(
        110,
        Math.round(250 * progress + 65)
      );

      await animateProgress(progress, 0, duration);
    }
  } finally {
    // At this point the next page underneath and currentImage are the same
    // drawing, so removing the completed curl layer is visually invisible.
    resetTurnVisuals();
    turning = false;
  }
}

async function autoTurn(direction) {
  if (turning || drag) return;

  const okay = await prepareTurn(direction);
  if (!okay) return;

  turning = true;

  try {
    await animateProgress(0, 1, 430);

    if (direction === "next") {
      await animateProgress(1, FORWARD_SETTLE_PROGRESS, 145);
    }

    currentIndex = activeTargetIndex;

    const target = await loadImage(currentIndex, "full");
    currentImage.src = target.src;
    currentImage.alt =
      pages[currentIndex].title ||
      `Drawing ${currentIndex + 1}`;

    updateControls();
    warmAround(currentIndex);
  } finally {
    resetTurnVisuals();
    turning = false;
  }
}

/* -------------------------------------------------------------------------- */
/* NORMAL PAGE / SCRUBBER                                                     */
/* -------------------------------------------------------------------------- */

async function setCurrent(index, { useThumb = false } = {}) {
  currentIndex = clamp(index, 0, pages.length - 1);

  try {
    const image = await loadImage(
      currentIndex,
      useThumb ? "thumb" : "full"
    );
    currentImage.src = image.src;
  } catch {
    const image = await loadImage(currentIndex, "full");
    currentImage.src = image.src;
  }

  currentImage.alt =
    pages[currentIndex].title ||
    `Drawing ${currentIndex + 1}`;

  updateControls();
  warmAround(currentIndex);
}

async function previewScrub(index) {
  index = clamp(index, 0, pages.length - 1);
  scrubIndex = index;

  updateControls(index);

  try {
    const image = await loadImage(index, "thumb");

    if (scrubIndex !== index) return;

    currentImage.src = image.src;
    currentImage.alt =
      pages[index].title ||
      `Drawing ${index + 1}`;
  } catch {
    // Keep the last successful preview frame on screen.
  }
}

function scheduleScrub(index) {
  scrubIndex = index;
  cancelAnimationFrame(scrubRaf);

  scrubRaf = requestAnimationFrame(() => {
    previewScrub(scrubIndex);
  });
}

async function commitScrub(index) {
  index = clamp(index, 0, pages.length - 1);
  scrubber.classList.remove("is-scrubbing");

  const image = await loadImage(index, "full");

  currentIndex = index;
  currentImage.src = image.src;
  currentImage.alt =
    pages[index].title ||
    `Drawing ${index + 1}`;

  updateControls();
  warmAround(index);
}

slider.addEventListener("pointerdown", () => {
  scrubber.classList.add("is-scrubbing");
});

slider.addEventListener("input", () => {
  scheduleScrub(Number(slider.value) - 1);
});

slider.addEventListener("change", () => {
  commitScrub(Number(slider.value) - 1);
});

slider.addEventListener("pointerup", () => {
  commitScrub(Number(slider.value) - 1);
});

/* -------------------------------------------------------------------------- */
/* LIVE DRAG                                                                  */
/* -------------------------------------------------------------------------- */

stage.addEventListener("pointerdown", (event) => {
  if (
    turning ||
    event.button > 0 ||
    event.target === slider ||
    event.target.closest(".scrubber")
  ) {
    return;
  }

  drag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    latestX: event.clientX,
    startTime: performance.now(),
    latestTime: performance.now(),
    direction: null,
    progress: 0,
    prepared: false,
    preparing: false
  };

  stage.setPointerCapture?.(event.pointerId);
});

stage.addEventListener("pointermove", async (event) => {
  if (!drag || drag.pointerId !== event.pointerId || turning) {
    return;
  }

  const coalesced =
    typeof event.getCoalescedEvents === "function"
      ? event.getCoalescedEvents()
      : [];

  const sample =
    coalesced.length
      ? coalesced[coalesced.length - 1]
      : event;

  drag.latestX = sample.clientX;
  drag.latestTime = performance.now();

  const dx = drag.latestX - drag.startX;

  if (
    !drag.direction &&
    !drag.preparing &&
    Math.abs(dx) >= DRAG_START_PX
  ) {
    drag.direction = dx < 0 ? "next" : "prev";

    const targetIndex =
      drag.direction === "next"
        ? currentIndex + 1
        : currentIndex - 1;

    if (targetIndex < 0 || targetIndex >= pages.length) {
      drag.direction = null;
      return;
    }

    drag.preparing = true;
    stage.classList.add("is-dragging");

    const thisDrag = drag;
    const okay = await prepareTurn(drag.direction);

    if (!drag || drag !== thisDrag) {
      resetTurnVisuals();
      return;
    }

    drag.preparing = false;
    drag.prepared = okay;

    if (!okay) return;
  }

  if (!drag?.prepared || !drag.direction) return;

  const distance =
    drag.direction === "next"
      ? drag.startX - drag.latestX
      : drag.latestX - drag.startX;

  drag.progress = clamp(
    distance / Math.max(1, stage.clientWidth * .78),
    0,
    1
  );

  // At most one GPU render per screen refresh. This removes the tiny
  // pointer-event timing jumps visible on mobile Safari.
  scheduleDragRender(drag.progress);
});

async function releaseDrag(event) {
  if (!drag || drag.pointerId !== event.pointerId) return;

  const snapshot = drag;
  drag = null;

  stage.releasePointerCapture?.(event.pointerId);
  stage.classList.remove("is-dragging");

  const now = performance.now();
  const finalX = event.clientX;
  const totalDx = finalX - snapshot.startX;
  const totalTime = Math.max(1, now - snapshot.startTime);
  const velocity = totalDx / totalTime;

  if (!snapshot.direction) {
    const isClick =
      Math.abs(totalDx) <= CLICK_MAX_PX &&
      totalTime <= CLICK_MAX_MS;

    if (isClick) {
      if (finalX >= stage.clientWidth * .5) {
        autoTurn("next");
      } else {
        autoTurn("prev");
      }
    }

    return;
  }

  if (!snapshot.prepared) {
    resetTurnVisuals();
    return;
  }

  const directionalVelocity =
    snapshot.direction === "next"
      ? -velocity
      : velocity;

  const commit =
    snapshot.progress >= TURN_THRESHOLD ||
    directionalVelocity >= VELOCITY_THRESHOLD;

  await finishTurn({
    commit,
    progress: snapshot.progress,
    velocity: directionalVelocity
  });
}

stage.addEventListener("pointerup", releaseDrag);
stage.addEventListener("pointercancel", releaseDrag);

window.addEventListener("keydown", (event) => {
  if (
    event.key === "ArrowRight" ||
    event.key === "PageDown" ||
    event.key === " "
  ) {
    event.preventDefault();
    autoTurn("next");
  } else if (
    event.key === "ArrowLeft" ||
    event.key === "PageUp"
  ) {
    event.preventDefault();
    autoTurn("prev");
  } else if (event.key === "Home") {
    event.preventDefault();
    commitScrub(0);
  } else if (event.key === "End") {
    event.preventDefault();
    commitScrub(pages.length - 1);
  }
});

window.addEventListener("resize", () => {
  gpuCurl.resize();

  if (curlCanvas.classList.contains("is-active")) {
    resetTurnVisuals();
    drag = null;
    turning = false;
  }
});

async function init() {
  try {
    gpuCurl.resize();

    const manifest = await loadManifest();
    pages = manifest.pages;

    slider.max = String(pages.length);
    pageTotal.textContent = pad(
      pages.length,
      Math.max(3, String(pages.length).length)
    );

    await setCurrent(0);
    idleWarmThumbnails();
  } catch (error) {
    console.error(error);
    status.textContent = "ARCHIVE COULD NOT BE LOADED.";
  }
}

init();
