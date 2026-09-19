import * as THREE from "../../js/vendor/three/three.module.js";
import { initPerformanceTier, getPerformanceTier } from "../../js/core/performance-tier.js";

initPerformanceTier();

const host = document.getElementById("xyt-canvas");
const status = document.getElementById("xyt-status");
const timeReadout = document.getElementById("xyt-time");
const sourceReadout = document.getElementById("xyt-source");
const scrub = document.getElementById("xyt-scrub");
const toggle = document.getElementById("xyt-toggle");
const resetButton = document.getElementById("xyt-reset");
const modeButtons = [...document.querySelectorAll(".xyt-mode")];
const maskButtons = [...document.querySelectorAll(".xyt-mask")];
const uploadInput = document.getElementById("xyt-upload-input");
const panelToggle = document.getElementById("xyt-panel-toggle");
const panel = document.getElementById("xyt-panel");
const trailLength = document.getElementById("xyt-trail-length");
const trailLengthValue = document.getElementById("xyt-trail-length-value");
const trailStrength = document.getElementById("xyt-trail-strength");
const trailStrengthValue = document.getElementById("xyt-trail-strength-value");
const transport = document.querySelector(".xyt-transport");

const syncVisibleViewport = () => {
  const viewport = window.visualViewport;
  const height = viewport?.height || window.innerHeight || document.documentElement.clientHeight;
  document.documentElement.style.setProperty("--app-height", `${Math.round(height)}px`);

  if (transport) {
    const transportHeight = Math.ceil(transport.getBoundingClientRect().height);
    if (transportHeight > 0) {
      document.documentElement.style.setProperty("--transport-height", `${transportHeight}px`);
    }
  }
};

syncVisibleViewport();
window.addEventListener("resize", syncVisibleViewport, { passive: true });
window.addEventListener("orientationchange", () => requestAnimationFrame(syncVisibleViewport), { passive: true });
window.visualViewport?.addEventListener("resize", syncVisibleViewport, { passive: true });
window.visualViewport?.addEventListener("scroll", syncVisibleViewport, { passive: true });

if (transport && "ResizeObserver" in window) {
  const transportObserver = new ResizeObserver(() => syncVisibleViewport());
  transportObserver.observe(transport);
}

const MODE = Object.freeze({
  motion: 0,
  silhouette: 1
});

const VISUAL = Object.freeze({
  planeWidth: 3.6,
  volumeDepth: 3.6,

  motionThreshold: 0.11,
  motionSoftness: 0.10,
  bodyLumaCenter: 0.54,
  bodyLumaSoftness: 0.26,
  bodyBiasWeight: 0.72,

  // Strong near-time form with a cleaner fade toward the edges of the moving window.
  trailOpacityNear: 0.92,
  trailOpacityFar: 0.055,
  falloffCurve: 1.18,
  scrubWindowRadius: 100,

  activeOpacity: 1.0,
  near: 0.01,
  far: 60
});

const UPLOAD = Object.freeze({
  targetFps: 24,
  maxFrames: 600,
  frameWidth: 320,
  atlasCols: 8,
  atlasRows: 8
});

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const formatTime = (seconds) => {
  if (!Number.isFinite(seconds)) return "00:00.00";
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${rest.toFixed(2).padStart(5, "0")}`;
};

class XYTTemporalVolume {
  constructor() {
    this.tier = getPerformanceTier();
    this.manifest = null;
    this.textures = [];
    this.volumeMeshes = [];
    this.bounds = null;

    this.currentTime = 0;
    this.currentFrame = 0;
    this.playing = false;
    this.isScrubbing = false;
    this.lastTick = performance.now();

    this.modeName = "motion";
    this.modeValue = MODE.motion;
    this.maskEnabled = true;
    this.trailWindowRadius = VISUAL.scrubWindowRadius;
    this.trailStrength = 1.0;

    this.frameSpacing = 0;
    this.planeHeight = 0;
    this.activeFrameMesh = null;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

    this.camera = new THREE.PerspectiveCamera(40, 1, VISUAL.near, VISUAL.far);
    this.renderer = new THREE.WebGLRenderer({
      antialias: this.tier !== "low",
      powerPreference: this.tier === "high" ? "high-performance" : "low-power"
    });

    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, this.tier === "high" ? 1.45 : 1.05)
    );
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.replaceChildren(this.renderer.domElement);

    this.orbit = {
      yaw: 0.72,
      pitch: -0.08,
      distance: 7.1,
      // Expanded camera range: get much closer to the temporal form,
      // or pull far enough back to read the full sculpture in space.
      minDistance: 2.15,
      maxDistance: 24.0
    };

    this.pointerMap = new Map();
    this.lastSinglePointer = null;
    this.lastPinchDistance = null;

    this.tick = this.tick.bind(this);
    this.onResize = this.onResize.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
    this.onWheel = this.onWheel.bind(this);

    this.installInteraction();
    this.installModeControls();
    this.installMaskControls();
    this.installScrubControls();
    this.installUploadControl();
    this.installPanelControl();
    this.installTrailControls();
    this.onResize();
    window.addEventListener("resize", this.onResize);
    this.frameHandle = requestAnimationFrame(this.tick);
  }

  async initialise() {
    const response = await fetch("./assets/frames.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`Manifest failed: ${response.status}`);

    this.manifest = await response.json();
    status.textContent = `LOADING ${this.manifest.frameCount} FRAMES INTO TEMPORAL VOLUME…`;

    this.textures = await Promise.all(
      this.manifest.atlases.map((atlas) => this.loadTexture(atlas.file))
    );

    this.buildVolume();
    this.setTime(0);
    this.updateCamera();
    this.setMode("motion");
    this.setMask(true);
  }

  loadTexture(url) {
    return new Promise((resolve, reject) => {
      new THREE.TextureLoader().load(
        url,
        (texture) => {
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.minFilter = THREE.LinearFilter;
          texture.magFilter = THREE.LinearFilter;
          texture.generateMipmaps = false;
          resolve(texture);
        },
        undefined,
        reject
      );
    });
  }

  clearVolume({ disposeTextures = false } = {}) {
    if (this.bounds) {
      this.scene.remove(this.bounds);
      this.bounds.geometry.dispose();
      this.bounds.material.dispose();
      this.bounds = null;
    }

    for (const entry of this.volumeMeshes) {
      this.scene.remove(entry.mesh);
      entry.geometry.dispose();
      entry.material.dispose();
    }
    this.volumeMeshes = [];

    if (this.activeFrameMesh) {
      this.scene.remove(this.activeFrameMesh);
      this.activeFrameMesh.geometry.dispose();
      this.activeFrameMesh.material.dispose();
      this.activeFrameMesh = null;
    }

    if (disposeTextures) {
      for (const texture of this.textures) texture.dispose();
      this.textures = [];
    }
  }

  buildVolume() {
    const aspect = this.manifest.frameWidth / this.manifest.frameHeight;
    this.planeHeight = VISUAL.planeWidth / aspect;
    const cols = this.manifest.atlasCols;
    const rows = this.manifest.atlasRows;
    const totalFrames = this.manifest.frameCount;

    this.frameSpacing = totalFrames > 1 ? VISUAL.volumeDepth / (totalFrames - 1) : 0;

    // Bounding box intentionally hidden in V21.
    this.bounds = null;

    this.manifest.atlases.forEach((atlasMeta, atlasIndex) => {
      const count = atlasMeta.frameCount;
      const geometry = new THREE.InstancedBufferGeometry();
      const base = new THREE.PlaneGeometry(VISUAL.planeWidth, this.planeHeight);

      geometry.index = base.index;
      geometry.attributes.position = base.attributes.position;
      geometry.attributes.normal = base.attributes.normal;
      geometry.attributes.uv = base.attributes.uv;

      const uvOffsets = new Float32Array(count * 2);
      const prevUvOffsets = new Float32Array(count * 2);
      const nextUvOffsets = new Float32Array(count * 2);
      const zOffsets = new Float32Array(count);
      const frameIndices = new Float32Array(count);

      for (let localIndex = 0; localIndex < count; localIndex += 1) {
        const globalFrame = atlasMeta.startFrame + localIndex;
        const col = localIndex % cols;
        const row = Math.floor(localIndex / cols);

        const currentU = col / cols;
        const currentV = 1 - (row + 1) / rows;
        uvOffsets[localIndex * 2] = currentU;
        uvOffsets[localIndex * 2 + 1] = currentV;

        let prevU = currentU;
        let prevV = currentV;
        if (localIndex > 0) {
          const prevLocalIndex = localIndex - 1;
          const prevCol = prevLocalIndex % cols;
          const prevRow = Math.floor(prevLocalIndex / cols);
          prevU = prevCol / cols;
          prevV = 1 - (prevRow + 1) / rows;
        }
        prevUvOffsets[localIndex * 2] = prevU;
        prevUvOffsets[localIndex * 2 + 1] = prevV;

        let nextU = currentU;
        let nextV = currentV;
        if (localIndex < count - 1) {
          const nextLocalIndex = localIndex + 1;
          const nextCol = nextLocalIndex % cols;
          const nextRow = Math.floor(nextLocalIndex / cols);
          nextU = nextCol / cols;
          nextV = 1 - (nextRow + 1) / rows;
        }
        nextUvOffsets[localIndex * 2] = nextU;
        nextUvOffsets[localIndex * 2 + 1] = nextV;

        zOffsets[localIndex] = this.getFrameZ(globalFrame);
        frameIndices[localIndex] = globalFrame;
      }

      geometry.setAttribute("uvOffset", new THREE.InstancedBufferAttribute(uvOffsets, 2));
      geometry.setAttribute("prevUvOffset", new THREE.InstancedBufferAttribute(prevUvOffsets, 2));
      geometry.setAttribute("nextUvOffset", new THREE.InstancedBufferAttribute(nextUvOffsets, 2));
      geometry.setAttribute("zOffset", new THREE.InstancedBufferAttribute(zOffsets, 1));
      geometry.setAttribute("frameIndex", new THREE.InstancedBufferAttribute(frameIndices, 1));
      geometry.instanceCount = count;

      const material = new THREE.ShaderMaterial({
        uniforms: {
          atlas: { value: this.textures[atlasIndex] },
          cols: { value: cols },
          rows: { value: rows },
          currentFrame: { value: this.currentFrame },
          totalFrames: { value: totalFrames },
          renderMode: { value: this.modeValue },
          maskEnabled: { value: this.maskEnabled ? 1.0 : 0.0 },
          motionThreshold: { value: VISUAL.motionThreshold },
          motionSoftness: { value: VISUAL.motionSoftness },
          bodyLumaCenter: { value: VISUAL.bodyLumaCenter },
          bodyLumaSoftness: { value: VISUAL.bodyLumaSoftness },
          bodyBiasWeight: { value: VISUAL.bodyBiasWeight },
          trailOpacityNear: { value: VISUAL.trailOpacityNear },
          trailOpacityFar: { value: VISUAL.trailOpacityFar },
          falloffCurve: { value: VISUAL.falloffCurve },
          frameWindow: { value: this.trailWindowRadius },
          trailStrength: { value: this.trailStrength }
        },
        transparent: true,
        depthWrite: false,
        depthTest: true,
        side: THREE.DoubleSide,
        blending: THREE.NormalBlending,
        vertexShader: `
          attribute vec2 uvOffset;
          attribute vec2 prevUvOffset;
          attribute vec2 nextUvOffset;
          attribute float zOffset;
          attribute float frameIndex;

          varying vec2 vUv;
          varying vec2 vPrevUv;
          varying vec2 vNextUv;
          varying float vFrameIndex;

          uniform float cols;
          uniform float rows;

          void main() {
            vec2 cell = vec2(cols, rows);
            vUv = uv / cell + uvOffset;
            vPrevUv = uv / cell + prevUvOffset;
            vNextUv = uv / cell + nextUvOffset;
            vFrameIndex = frameIndex;

            vec3 transformed = position;
            transformed.z += zOffset;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
          }
        `,
        fragmentShader: `
          precision highp float;

          uniform sampler2D atlas;
          uniform float currentFrame;
          uniform float totalFrames;
          uniform float renderMode;
          uniform float maskEnabled;
          uniform float motionThreshold;
          uniform float motionSoftness;
          uniform float bodyLumaCenter;
          uniform float bodyLumaSoftness;
          uniform float bodyBiasWeight;
          uniform float trailOpacityNear;
          uniform float trailOpacityFar;
          uniform float falloffCurve;
          uniform float frameWindow;
          uniform float trailStrength;

          varying vec2 vUv;
          varying vec2 vPrevUv;
          varying vec2 vNextUv;
          varying float vFrameIndex;

          float luma(vec3 color) {
            return dot(color, vec3(0.299, 0.587, 0.114));
          }

          float bodyMask(vec3 current) {
            float currentLuma = luma(current);
            return 1.0 - smoothstep(
              bodyLumaCenter - bodyLumaSoftness,
              bodyLumaCenter + bodyLumaSoftness,
              currentLuma
            );
          }

          float isolationMask(vec2 uv, vec2 prevUv, vec2 nextUv) {
            vec3 current = texture2D(atlas, uv).rgb;
            vec3 previous = texture2D(atlas, prevUv).rgb;
            vec3 nextFrame = texture2D(atlas, nextUv).rgb;
            float currentLuma = luma(current);
            float previousLuma = luma(previous);
            float nextLuma = luma(nextFrame);

            float previousDiff = max(
              length(current - previous) * 0.70,
              abs(currentLuma - previousLuma) * 1.25
            );
            float nextDiff = max(
              length(current - nextFrame) * 0.70,
              abs(currentLuma - nextLuma) * 1.25
            );
            float temporalDiff = max(previousDiff, nextDiff);

            float motion = smoothstep(
              motionThreshold,
              motionThreshold + motionSoftness,
              temporalDiff
            );

            float bias = bodyMask(current);
            float bodyWeighted = motion * clamp(bias * 1.46, 0.0, 1.0);
            return clamp(
              mix(motion * 0.28, bodyWeighted, bodyBiasWeight),
              0.0,
              1.0
            );
          }

          void main() {
            float frameDistance = abs(vFrameIndex - currentFrame);

            // Keep the temporal sculpture centred on the live/current frame.
            if (frameDistance > frameWindow) discard;

            // The active frame is rendered separately at 100%; never double-render it in the trail.
            if (frameDistance < 0.5) discard;

            vec4 texel = texture2D(atlas, vUv);
            float isolatedMotion = isolationMask(vUv, vPrevUv, vNextUv);
            float bodyOnly = bodyMask(texel.rgb);

            // Normalize falloff to the visible window, not the full clip.
            float localDistance = clamp(frameDistance / max(frameWindow, 1.0), 0.0, 1.0);
            float age = pow(localDistance, falloffCurve);
            float trailOpacity = mix(trailOpacityNear, trailOpacityFar, age) * trailStrength;

            float alpha;
            vec3 outputColor;

            if (renderMode < 0.5) {
              outputColor = mix(texel.rgb * 0.90, texel.rgb * 1.08, isolatedMotion * 0.60);
              // Raw full-frame mode intentionally stays quieter to avoid an opaque video tunnel.
              float source = maskEnabled > 0.5 ? isolatedMotion : 0.20;
              alpha = trailOpacity * source;
            } else {
              float silhouetteSource = maskEnabled > 0.5 ? isolatedMotion : bodyOnly;
              float silhouette = smoothstep(0.035, 0.24, silhouetteSource);
              outputColor = vec3(0.94);
              alpha = trailOpacity * silhouette;
            }

            alpha = clamp(alpha, 0.0, 0.94);
            if (alpha < 0.008) discard;
            gl_FragColor = vec4(outputColor, alpha);
          }
        `
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.volumeMeshes.push({ mesh, geometry, material });
      base.dispose();
    });

    this.buildCurrentFramePlane();
  }

  buildCurrentFramePlane() {
    const geometry = new THREE.PlaneGeometry(VISUAL.planeWidth, this.planeHeight);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        atlas: { value: this.textures[0] },
        cols: { value: this.manifest.atlasCols },
        rows: { value: this.manifest.atlasRows },
        uvOffset: { value: new THREE.Vector2(0, 0) },
        activeOpacity: { value: VISUAL.activeOpacity }
      },
      transparent: false,
      depthWrite: true,
      depthTest: true,
      side: THREE.DoubleSide,
      vertexShader: `
        varying vec2 vUv;
        uniform vec2 uvOffset;
        uniform float cols;
        uniform float rows;

        void main() {
          vUv = uv / vec2(cols, rows) + uvOffset;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        uniform sampler2D atlas;
        uniform float activeOpacity;
        varying vec2 vUv;

        void main() {
          vec4 texel = texture2D(atlas, vUv);
          gl_FragColor = vec4(texel.rgb, activeOpacity);
        }
      `
    });

    this.activeFrameMesh = new THREE.Mesh(geometry, material);
    this.activeFrameMesh.renderOrder = 10;
    this.scene.add(this.activeFrameMesh);
  }

  getFrameZ(frameIndex) {
    return VISUAL.volumeDepth * 0.5 - frameIndex * this.frameSpacing;
  }

  resolveFrameMeta(frameIndex) {
    const safeFrame = clamp(frameIndex, 0, this.manifest.frameCount - 1);
    let atlasIndex = 0;
    let atlasMeta = this.manifest.atlases[0];

    for (let i = 0; i < this.manifest.atlases.length; i += 1) {
      const candidate = this.manifest.atlases[i];
      if (safeFrame >= candidate.startFrame && safeFrame < candidate.startFrame + candidate.frameCount) {
        atlasIndex = i;
        atlasMeta = candidate;
        break;
      }
    }

    const localIndex = safeFrame - atlasMeta.startFrame;
    const col = localIndex % this.manifest.atlasCols;
    const row = Math.floor(localIndex / this.manifest.atlasCols);

    return {
      atlasIndex,
      col,
      row,
      z: this.getFrameZ(safeFrame)
    };
  }

  updateTrailUniforms() {
    for (const { material } of this.volumeMeshes) {
      material.uniforms.currentFrame.value = this.currentFrame;
      material.uniforms.renderMode.value = this.modeValue;
      material.uniforms.maskEnabled.value = this.maskEnabled ? 1.0 : 0.0;
      material.uniforms.frameWindow.value = this.trailWindowRadius;
      material.uniforms.trailStrength.value = this.trailStrength;
    }
  }

  updateCurrentFramePlane() {
    if (!this.activeFrameMesh || !this.manifest) return;

    const meta = this.resolveFrameMeta(this.currentFrame);
    const material = this.activeFrameMesh.material;

    material.uniforms.atlas.value = this.textures[meta.atlasIndex];
    material.uniforms.uvOffset.value.set(
      meta.col / this.manifest.atlasCols,
      1 - (meta.row + 1) / this.manifest.atlasRows
    );
    this.activeFrameMesh.position.set(0, 0, meta.z);
    this.updateTrailUniforms();
  }

  setTime(seconds) {
    if (!this.manifest) return;

    this.currentTime = clamp(seconds, 0, this.manifest.duration);
    this.currentFrame = clamp(
      Math.round(this.currentTime * this.manifest.fps),
      0,
      this.manifest.frameCount - 1
    );

    this.updateCurrentFramePlane();

    scrub.value = String(
      Math.round((this.currentTime / Math.max(this.manifest.duration, 0.001)) * 1000)
    );
    timeReadout.textContent =
      `TIME ${formatTime(this.currentTime)} / ${formatTime(this.manifest.duration)}`;
  }

  installModeControls() {
    modeButtons.forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.setMode(button.dataset.mode);
      });
    });
  }

  setMode(modeName) {
    if (!Object.prototype.hasOwnProperty.call(MODE, modeName)) return;

    this.modeName = modeName;
    this.modeValue = MODE[modeName];
    this.updateTrailUniforms();

    modeButtons.forEach((button) => {
      const active = button.dataset.mode === modeName;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });

    status.textContent = `MODE · ${modeName.toUpperCase()} · MASK ${this.maskEnabled ? "ON" : "OFF"}`;
  }

  installMaskControls() {
    maskButtons.forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.setMask(button.dataset.mask === "on");
      });
    });
  }

  setMask(enabled) {
    this.maskEnabled = Boolean(enabled);
    this.updateTrailUniforms();

    maskButtons.forEach((button) => {
      const active = (button.dataset.mask === "on") === this.maskEnabled;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });

    status.textContent = `MASK ${this.maskEnabled ? "ON" : "OFF"} · ${this.modeName.toUpperCase()} TRAIL`;
  }

  installScrubControls() {
    const startScrub = () => {
      if (!this.manifest) return;
      this.setPlaying(false);
      this.isScrubbing = true;
      this.updateTrailUniforms();
      status.textContent = `SCRUBBING · ±${this.trailWindowRadius} FRAME TEMPORAL FOCUS · MASK ${this.maskEnabled ? "ON" : "OFF"}`;
    };

    const endScrub = () => {
      if (!this.manifest) return;
      this.isScrubbing = false;
      this.updateTrailUniforms();
      status.textContent = `PAUSED · ±${this.trailWindowRadius} FRAME TEMPORAL FOCUS · MASK ${this.maskEnabled ? "ON" : "OFF"}`;
    };

    scrub.addEventListener("pointerdown", startScrub);
    scrub.addEventListener("pointerup", endScrub);
    scrub.addEventListener("pointercancel", endScrub);
    scrub.addEventListener("change", endScrub);
  }

  installPanelControl() {
    if (!panelToggle || !panel) return;

    const setCollapsed = (collapsed) => {
      panel.classList.toggle("is-collapsed", collapsed);
      panelToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
      panelToggle.textContent = collapsed ? "TOOLS" : "CLOSE";
    };

    // Mobile opens on the artwork first; controls are one tap away.
    setCollapsed(window.matchMedia("(max-width: 720px)").matches);

    panelToggle.addEventListener("click", () => {
      setCollapsed(!panel.classList.contains("is-collapsed"));
    });
  }

  installTrailControls() {
    if (trailLength && trailLengthValue) {
      const updateLength = () => {
        this.trailWindowRadius = Number(trailLength.value) || VISUAL.scrubWindowRadius;
        trailLengthValue.textContent = `±${this.trailWindowRadius}`;
        this.updateTrailUniforms();
        status.textContent = `TRAIL LENGTH · ±${this.trailWindowRadius} FRAMES`;
      };
      trailLength.addEventListener("input", updateLength);
      updateLength();
    }

    if (trailStrength && trailStrengthValue) {
      const updateStrength = () => {
        const percent = Number(trailStrength.value) || 100;
        this.trailStrength = percent / 100;
        trailStrengthValue.textContent = `${percent}%`;
        this.updateTrailUniforms();
        status.textContent = `TRAIL STRENGTH · ${percent}%`;
      };
      trailStrength.addEventListener("input", updateStrength);
      updateStrength();
    }
  }

  installUploadControl() {
    uploadInput.addEventListener("change", async () => {
      const [file] = uploadInput.files || [];
      if (!file) return;

      try {
        await this.rebuildFromUploadedVideo(file);
      } catch (error) {
        console.error(error);
        status.textContent = "VIDEO PROCESSING FAILED";
      } finally {
        uploadInput.value = "";
      }
    });
  }

  async rebuildFromUploadedVideo(file) {
    this.setPlaying(false);
    this.isScrubbing = false;
    status.textContent = "PREPARING UPLOADED VIDEO…";

    const blobUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.src = blobUrl;

    try {
      await this.waitForVideoReady(video);

      const duration = Number(video.duration);
      if (!Number.isFinite(duration) || duration <= 0) {
        throw new Error("Uploaded video has no readable duration.");
      }

      const sourceWidth = video.videoWidth || 16;
      const sourceHeight = video.videoHeight || 9;
      const frameWidth = UPLOAD.frameWidth;
      const frameHeight = Math.max(2, Math.round(frameWidth * sourceHeight / sourceWidth));

      const frameCount = clamp(
        Math.round(duration * UPLOAD.targetFps),
        2,
        UPLOAD.maxFrames
      );
      const fps = (frameCount - 1) / duration;
      const framesPerAtlas = UPLOAD.atlasCols * UPLOAD.atlasRows;
      const atlasCount = Math.ceil(frameCount / framesPerAtlas);

      const canvases = [];
      const contexts = [];
      for (let atlasIndex = 0; atlasIndex < atlasCount; atlasIndex += 1) {
        const canvas = document.createElement("canvas");
        canvas.width = frameWidth * UPLOAD.atlasCols;
        canvas.height = frameHeight * UPLOAD.atlasRows;
        canvases.push(canvas);
        contexts.push(canvas.getContext("2d", { alpha: false }));
      }

      for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
        const time = frameCount <= 1
          ? 0
          : (frameIndex / (frameCount - 1)) * Math.max(0, duration - 0.002);

        await this.seekVideo(video, time);

        const atlasIndex = Math.floor(frameIndex / framesPerAtlas);
        const localIndex = frameIndex % framesPerAtlas;
        const col = localIndex % UPLOAD.atlasCols;
        const row = Math.floor(localIndex / UPLOAD.atlasCols);

        contexts[atlasIndex].drawImage(
          video,
          col * frameWidth,
          row * frameHeight,
          frameWidth,
          frameHeight
        );

        if (frameIndex % 10 === 0 || frameIndex === frameCount - 1) {
          const percent = Math.round(((frameIndex + 1) / frameCount) * 100);
          status.textContent = `PROCESSING VIDEO · ${percent}% · ${frameCount} TEMPORAL SLICES`;
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
      }

      const newTextures = canvases.map((canvas) => {
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        texture.needsUpdate = true;
        return texture;
      });

      const atlases = Array.from({ length: atlasCount }, (_, atlasIndex) => {
        const startFrame = atlasIndex * framesPerAtlas;
        return {
          index: atlasIndex,
          startFrame,
          frameCount: Math.min(framesPerAtlas, frameCount - startFrame),
          file: null
        };
      });

      this.clearVolume({ disposeTextures: true });
      this.manifest = {
        fps,
        duration,
        frameCount,
        frameWidth,
        frameHeight,
        atlasCols: UPLOAD.atlasCols,
        atlasRows: UPLOAD.atlasRows,
        framesPerAtlas,
        atlases
      };
      this.textures = newTextures;
      this.currentTime = 0;
      this.currentFrame = 0;

      this.buildVolume();
      this.setTime(0);
      this.updateCamera();
      this.updateTrailUniforms();

      sourceReadout.textContent = `SOURCE · ${file.name}`;
      status.textContent = `READY · ${frameCount} SLICES · ±${this.trailWindowRadius} FRAME FOCUS · MASK ${this.maskEnabled ? "ON" : "OFF"}`;
    } finally {
      video.pause();
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(blobUrl);
    }
  }

  waitForVideoReady(video) {
    if (video.readyState >= HTMLMediaElement.HAVE_METADATA && video.videoWidth) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(video.error || new Error("Video failed to load."));
      };
      const cleanup = () => {
        video.removeEventListener("loadeddata", onReady);
        video.removeEventListener("error", onError);
      };

      video.addEventListener("loadeddata", onReady, { once: true });
      video.addEventListener("error", onError, { once: true });
      video.load();
    });
  }

  seekVideo(video, time) {
    const safeTime = clamp(time, 0, Math.max(0, video.duration - 0.001));
    if (Math.abs(video.currentTime - safeTime) < 0.002 && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const onSeeked = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(video.error || new Error("Video seek failed."));
      };
      const cleanup = () => {
        video.removeEventListener("seeked", onSeeked);
        video.removeEventListener("error", onError);
      };

      video.addEventListener("seeked", onSeeked, { once: true });
      video.addEventListener("error", onError, { once: true });
      video.currentTime = safeTime;
    });
  }

  setPlaying(value) {
    this.playing = Boolean(value);
    if (this.playing) this.isScrubbing = false;
    this.updateTrailUniforms();
    toggle.textContent = this.playing ? "PAUSE" : "PLAY";
    status.textContent = this.playing
      ? `PLAYING · ${this.modeName.toUpperCase()} · ±${this.trailWindowRadius} FRAME MOVING TRAIL · MASK ${this.maskEnabled ? "ON" : "OFF"}`
      : `PAUSED · ${this.modeName.toUpperCase()} · ±${this.trailWindowRadius} FRAME TRAIL · MASK ${this.maskEnabled ? "ON" : "OFF"}`;
  }

  updateCamera() {
    const target = new THREE.Vector3(0, 0, 0);
    const cosPitch = Math.cos(this.orbit.pitch);

    this.camera.position.set(
      this.orbit.distance * Math.sin(this.orbit.yaw) * cosPitch,
      this.orbit.distance * Math.sin(this.orbit.pitch),
      this.orbit.distance * Math.cos(this.orbit.yaw) * cosPitch
    );
    this.camera.lookAt(target);
  }

  resetView() {
    this.orbit.yaw = 0.72;
    this.orbit.pitch = -0.08;
    this.orbit.distance = 7.1;
    this.updateCamera();
  }

  installInteraction() {
    const canvas = this.renderer.domElement;
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
  }

  onPointerDown(event) {
    this.renderer.domElement.setPointerCapture?.(event.pointerId);
    this.pointerMap.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.pointerMap.size === 1) {
      this.lastSinglePointer = { x: event.clientX, y: event.clientY };
      this.lastPinchDistance = null;
    } else if (this.pointerMap.size === 2) {
      this.lastSinglePointer = null;
      this.lastPinchDistance = this.getPinchDistance();
    }
  }

  onPointerMove(event) {
    if (!this.pointerMap.has(event.pointerId)) return;
    this.pointerMap.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (this.pointerMap.size === 1 && this.lastSinglePointer) {
      const dx = event.clientX - this.lastSinglePointer.x;
      const dy = event.clientY - this.lastSinglePointer.y;

      this.orbit.yaw -= dx * 0.005;
      this.orbit.pitch = THREE.MathUtils.clamp(this.orbit.pitch + dy * 0.004, -1.05, 1.05);
      this.lastSinglePointer = { x: event.clientX, y: event.clientY };
      this.updateCamera();
      return;
    }

    if (this.pointerMap.size === 2) {
      const distance = this.getPinchDistance();
      if (this.lastPinchDistance !== null && distance > 0) {
        const factor = this.lastPinchDistance / distance;
        this.orbit.distance = THREE.MathUtils.clamp(
          this.orbit.distance * factor,
          this.orbit.minDistance,
          this.orbit.maxDistance
        );
        this.updateCamera();
      }
      this.lastPinchDistance = distance;
    }
  }

  onPointerUp(event) {
    this.pointerMap.delete(event.pointerId);
    if (this.pointerMap.size === 1) {
      const remaining = [...this.pointerMap.values()][0];
      this.lastSinglePointer = { ...remaining };
      this.lastPinchDistance = null;
    } else {
      this.lastSinglePointer = null;
      this.lastPinchDistance = null;
    }
  }

  getPinchDistance() {
    const points = [...this.pointerMap.values()];
    if (points.length !== 2) return 0;
    return Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
  }

  onWheel(event) {
    event.preventDefault();

    if (event.shiftKey) {
      const factor = Math.exp(event.deltaY * 0.0012);
      this.orbit.distance = THREE.MathUtils.clamp(
        this.orbit.distance * factor,
        this.orbit.minDistance,
        this.orbit.maxDistance
      );
      this.updateCamera();
      return;
    }

    this.setPlaying(false);
    const deltaSeconds = event.deltaY * (this.manifest.duration / 7000);
    this.setTime(this.currentTime + deltaSeconds);
  }

  onResize() {
    syncVisibleViewport();
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  tick(now) {
    const dt = Math.min(0.05, Math.max(0, (now - this.lastTick) / 1000));
    this.lastTick = now;

    if (this.playing && this.manifest) {
      let next = this.currentTime + dt;
      if (next >= this.manifest.duration) next = 0;
      this.setTime(next);
    }

    this.renderer.render(this.scene, this.camera);
    this.frameHandle = requestAnimationFrame(this.tick);
  }
}

const volume = new XYTTemporalVolume();

volume.initialise().catch((error) => {
  console.error(error);
  status.textContent = "TEMPORAL VOLUME FAILED TO LOAD";
});

toggle.addEventListener("click", () => volume.setPlaying(!volume.playing));
resetButton.addEventListener("click", () => volume.resetView());

scrub.addEventListener("input", () => {
  if (!volume.manifest) return;
  volume.setPlaying(false);
  volume.setTime((Number(scrub.value) / 1000) * volume.manifest.duration);
});
