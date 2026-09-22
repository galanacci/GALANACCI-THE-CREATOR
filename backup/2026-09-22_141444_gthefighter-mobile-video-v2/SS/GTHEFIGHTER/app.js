import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const experience = document.querySelector(".experience");
const canvas = document.querySelector("#frame-viewer");
const video = document.querySelector("#fighter-video");
const resetButton = document.querySelector("#reset-view");
const progressBar = document.querySelector("#loading-progress");
const progressLabel = document.querySelector("#loading-percentage");
const loadingState = document.querySelector("#loading-state");
const fallback = document.querySelector("#webgl-fallback");

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarsePointer = window.matchMedia("(hover: none), (pointer: coarse)").matches;
const lowMemory = typeof navigator.deviceMemory === "number" && navigator.deviceMemory <= 4;
const pixelRatioCap = coarsePointer || lowMemory ? 1.35 : 2;

let renderer;
let scene;
let camera;
let controls;
let frameRoot;
let animationFrame;
let environmentRenderTarget;
let modelProgress = 0;
let videoReady = false;
let modelReady = false;


/* GTC GTHEFIGHTER MOBILE VIDEO V1 START */
function prepareArtworkVideo() {
  video.muted = true;
  video.defaultMuted = true;
  video.autoplay = true;
  video.loop = true;
  video.playsInline = true;

  video.setAttribute("muted", "");
  video.setAttribute("autoplay", "");
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");

  /*
    iOS may ignore preload="auto", but calling load() after the media
    properties are established gives Safari the correct inline/autoplay state
    before Three.js creates its VideoTexture.
  */
  try {
    video.load();
  } catch {}
}

function attemptArtworkVideoPlayback() {
  if (!video) return;

  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;

  const playAttempt = video.play();

  if (playAttempt && typeof playAttempt.catch === "function") {
    playAttempt.catch(() => {
      /*
        Mobile browsers can still require the first user gesture.
        pointerdown/touchstart listeners below retry from a trusted gesture.
      */
    });
  }
}

function markVideoUsable() {
  if (!videoReady) {
    videoReady = true;
    updateCombinedProgress();
  }

  attemptArtworkVideoPlayback();
}
/* GTC GTHEFIGHTER MOBILE VIDEO V1 END */
function setProgress(value) {
  const bounded = Math.max(0, Math.min(100, Math.round(value)));
  progressBar.style.width = `${bounded}%`;
  progressLabel.textContent = `${String(bounded).padStart(3, "0")}%`;
}

function updateCombinedProgress() {
  const combined = modelProgress * .82 + (videoReady ? 18 : 0);
  setProgress(combined);

  if (modelReady && videoReady) {
    setProgress(100);
    window.setTimeout(() => experience.classList.add("is-ready"), 120);
  }
}

function markInteraction() {
  experience.classList.add("has-interacted");
  video.play().catch(() => {});
}

function showFallback(message) {
  loadingState.hidden = true;
  fallback.hidden = false;
  const label = fallback.querySelector("p");
  if (message && label) label.textContent = message;
}

function createScreenMask() {
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = 256;
  maskCanvas.height = 464;
  const context = maskCanvas.getContext("2d");
  const inset = 2;
  // The Rhino SCREEN layer is 86 mm wide with a 13.5 mm corner fillet.
  // Preserve that exact ratio instead of applying a generic rounded mask.
  const radius = maskCanvas.width * (13.5 / 86);
  const width = maskCanvas.width - inset * 2;
  const height = maskCanvas.height - inset * 2;

  context.fillStyle = "#000";
  context.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
  context.fillStyle = "#fff";
  context.beginPath();
  context.moveTo(inset + radius, inset);
  context.lineTo(inset + width - radius, inset);
  context.quadraticCurveTo(inset + width, inset, inset + width, inset + radius);
  context.lineTo(inset + width, inset + height - radius);
  context.quadraticCurveTo(inset + width, inset + height, inset + width - radius, inset + height);
  context.lineTo(inset + radius, inset + height);
  context.quadraticCurveTo(inset, inset + height, inset, inset + height - radius);
  context.lineTo(inset, inset + radius);
  context.quadraticCurveTo(inset, inset, inset + radius, inset);
  context.closePath();
  context.fill();

  const texture = new THREE.CanvasTexture(maskCanvas);
  texture.colorSpace = THREE.NoColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function createGlassReflectionTexture() {
  const reflectionCanvas = document.createElement("canvas");
  reflectionCanvas.width = 512;
  reflectionCanvas.height = 780;
  const context = reflectionCanvas.getContext("2d");

  context.clearRect(0, 0, reflectionCanvas.width, reflectionCanvas.height);
  context.save();
  context.translate(reflectionCanvas.width * .5, reflectionCanvas.height * .5);
  context.rotate(-.28);

  const softbox = context.createLinearGradient(-150, 0, 150, 0);
  softbox.addColorStop(0, "rgba(255, 255, 255, 0)");
  softbox.addColorStop(.35, "rgba(255, 255, 255, .04)");
  softbox.addColorStop(.5, "rgba(255, 255, 255, .34)");
  softbox.addColorStop(.65, "rgba(255, 255, 255, .05)");
  softbox.addColorStop(1, "rgba(255, 255, 255, 0)");
  context.fillStyle = softbox;
  context.fillRect(-150, -reflectionCanvas.height, 300, reflectionCanvas.height * 2);

  const creamRim = context.createLinearGradient(-245, 0, -150, 0);
  creamRim.addColorStop(0, "rgba(234, 209, 178, 0)");
  creamRim.addColorStop(.72, "rgba(234, 209, 178, .26)");
  creamRim.addColorStop(1, "rgba(234, 209, 178, 0)");
  context.fillStyle = creamRim;
  context.fillRect(-245, -reflectionCanvas.height, 95, reflectionCanvas.height * 2);
  context.restore();

  const texture = new THREE.CanvasTexture(reflectionCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function createMaterials(videoTexture) {
  const frontGlass = new THREE.MeshPhysicalMaterial({
    color: 0xf2f2ee,
    metalness: 0,
    roughness: .17,
    transmission: .38,
    thickness: .08,
    transparent: true,
    opacity: .46,
    depthWrite: false,
    clearcoat: .9,
    clearcoatRoughness: .1,
    ior: 1.46,
    envMapIntensity: 2.2,
    side: THREE.DoubleSide
  });

  const backGlass = frontGlass.clone();
  backGlass.color.setHex(0xead1b2);
  backGlass.roughness = .34;
  backGlass.transmission = .2;
  backGlass.opacity = .42;
  backGlass.thickness = .12;
  backGlass.envMapIntensity = 2;
  backGlass.emissive.setHex(0xead1b2);
  backGlass.emissiveIntensity = .16;

  const chrome = new THREE.MeshStandardMaterial({
    color: 0xe1e1de,
    metalness: .72,
    roughness: .16,
    envMapIntensity: 2.35,
    side: THREE.DoubleSide
  });

  const frame = new THREE.MeshStandardMaterial({
    color: 0x27272a,
    metalness: .64,
    roughness: .26,
    envMapIntensity: 1.15,
    side: THREE.DoubleSide
  });

  const screen = new THREE.MeshBasicMaterial({
    map: videoTexture,
    alphaMap: createScreenMask(),
    transparent: true,
    alphaTest: .5,
    side: THREE.DoubleSide,
    toneMapped: false
  });

  const screenBacking = new THREE.MeshBasicMaterial({
    color: 0x050505,
    side: THREE.DoubleSide
  });

  return { frontGlass, backGlass, chrome, frame, screen, screenBacking };
}

function configureModel(gltf, videoTexture) {
  frameRoot = gltf.scene;
  const meshes = [];
  frameRoot.traverse((object) => {
    if (!object.isMesh) return;
    meshes.push(object);
    object.castShadow = !lowMemory;
    object.receiveShadow = true;
  });

  if (meshes.length < 3) {
    throw new Error("Digital frame screen mesh was not found.");
  }

  const materials = createMaterials(videoTexture);
  let screenMesh;
  let frontGlassMesh;
  let backGlassMesh;
  meshes.forEach((mesh) => {
    const label = mesh.name.toUpperCase();
    if (label === "FRONT_GLASS") {
      mesh.material = materials.frontGlass;
      frontGlassMesh = mesh;
    } else if (label === "BACK_GLASS") {
      mesh.material = materials.backGlass;
      backGlassMesh = mesh;
    } else if (label === "SCREEN") {
      mesh.material = materials.screenBacking;
      screenMesh = mesh;
    } else if (label === "METAL_SCREWS") {
      mesh.material = materials.chrome;
    } else if (label === "FRAME" || label.startsWith("FRAME_")) {
      mesh.material = materials.frame;
    }
  });

  if (!screenMesh) {
    throw new Error("The labelled SCREEN mesh was not found.");
  }

  if (!frontGlassMesh) {
    throw new Error("The labelled FRONT_GLASS mesh was not found.");
  }

  if (!backGlassMesh) {
    throw new Error("The labelled BACK_GLASS mesh was not found.");
  }

  const bounds = new THREE.Box3().setFromObject(frameRoot);
  const size = bounds.getSize(new THREE.Vector3());
  const centre = bounds.getCenter(new THREE.Vector3());
  const targetHeight = coarsePointer ? 2.15 : 2.3;
  const scale = targetHeight / size.y;
  frameRoot.scale.setScalar(scale);
  // Keep the front glass facing the viewer while exposing enough depth to
  // distinguish the separate rear glass panel at rest.
  const frontRotation = Math.PI + .12;
  frameRoot.rotation.y = frontRotation;
  const transformedCentre = centre
    .clone()
    .multiplyScalar(scale)
    .applyAxisAngle(new THREE.Vector3(0, 1, 0), frontRotation);
  frameRoot.position.copy(transformedCentre).multiplyScalar(-1);
  frameRoot.position.y += .08;

  // Keep the full portrait artwork inside the labelled screen opening. The
  // original screen UVs were authored for a static image, so a fitted plane is
  // more reliable than replacing the Rhino material directly.
  screenMesh.geometry.computeBoundingBox();
  const screenBounds = screenMesh.geometry.boundingBox;
  const screenSize = screenBounds.getSize(new THREE.Vector3());
  const screenCentre = screenBounds.getCenter(new THREE.Vector3());
  const videoSurface = new THREE.Mesh(
    new THREE.PlaneGeometry(screenSize.x * .996, screenSize.y * .996),
    materials.screen
  );
  videoSurface.position.set(screenCentre.x, screenCentre.y, screenBounds.min.z - .00035);
  videoSurface.rotation.y = Math.PI;
  videoSurface.castShadow = false;
  videoSurface.receiveShadow = false;
  frameRoot.add(videoSurface);

  frontGlassMesh.geometry.computeBoundingBox();
  const glassBounds = frontGlassMesh.geometry.boundingBox;
  const glassSize = glassBounds.getSize(new THREE.Vector3());
  const glassCentre = glassBounds.getCenter(new THREE.Vector3());
  const reflectedSoftbox = new THREE.Mesh(
    new THREE.PlaneGeometry(glassSize.x * .97, glassSize.y * .97),
    new THREE.MeshBasicMaterial({
      map: createGlassReflectionTexture(),
      transparent: true,
      opacity: .72,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false
    })
  );
  reflectedSoftbox.position.set(glassCentre.x, glassCentre.y, glassBounds.min.z - .00055);
  reflectedSoftbox.rotation.y = Math.PI;
  reflectedSoftbox.renderOrder = 5;
  frameRoot.add(reflectedSoftbox);

  backGlassMesh.geometry.computeBoundingBox();
  const backingBounds = backGlassMesh.geometry.boundingBox;
  const backingSize = backingBounds.getSize(new THREE.Vector3());
  const backingCentre = backingBounds.getCenter(new THREE.Vector3());
  const backingReflection = new THREE.Mesh(
    new THREE.PlaneGeometry(backingSize.x * .95, backingSize.y * .95),
    new THREE.MeshBasicMaterial({
      map: createGlassReflectionTexture(),
      transparent: true,
      opacity: .34,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false
    })
  );
  backingReflection.position.set(
    backingCentre.x,
    backingCentre.y,
    backingBounds.min.z - .0003
  );
  backingReflection.rotation.y = Math.PI;
  backingReflection.renderOrder = 2;
  frameRoot.add(backingReflection);
  scene.add(frameRoot);
}

function resetView() {
  if (!controls || !camera) return;
  camera.position.set(0, .12, 5.8);
  controls.target.set(0, 0, 0);
  controls.update();
  markInteraction();
}

function createStudioEnvironment() {
  const environmentCanvas = document.createElement("canvas");
  environmentCanvas.width = lowMemory ? 512 : 1024;
  environmentCanvas.height = lowMemory ? 256 : 512;
  const context = environmentCanvas.getContext("2d");
  const { width, height } = environmentCanvas;

  context.fillStyle = "#050505";
  context.fillRect(0, 0, width, height);

  const addSoftbox = (x, y, radius, colour, strength = 1) => {
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, colour);
    gradient.addColorStop(.3, colour);
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    context.save();
    context.globalAlpha = strength;
    context.fillStyle = gradient;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    context.restore();
  };

  addSoftbox(width * .18, height * .32, width * .2, "rgba(255, 255, 250, .98)", .95);
  addSoftbox(width * .78, height * .42, width * .16, "rgba(234, 209, 178, .94)", .84);
  addSoftbox(width * .5, height * .08, width * .2, "rgba(255, 255, 255, .78)", .7);
  addSoftbox(width * .5, height * .5, width * .12, "rgba(255, 255, 255, .96)", .72);

  const texture = new THREE.CanvasTexture(environmentCanvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return texture;
}

function addEnvironment() {
  const environmentSource = createStudioEnvironment();
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  pmremGenerator.compileEquirectangularShader();
  environmentRenderTarget = pmremGenerator.fromEquirectangular(environmentSource);
  scene.environment = environmentRenderTarget.texture;
  environmentSource.dispose();
  pmremGenerator.dispose();
  scene.add(new THREE.AmbientLight(0xffffff, .38));
  scene.add(new THREE.HemisphereLight(0xf4f1ea, 0x17131d, 1.25));

  const key = new THREE.DirectionalLight(0xffffff, 3.15);
  key.position.set(-3.8, 5.2, 5.5);
  key.castShadow = !lowMemory;
  key.shadow.mapSize.set(lowMemory ? 512 : 1024, lowMemory ? 512 : 1024);
  scene.add(key);

  const rim = new THREE.DirectionalLight(0xead1b2, 1.8);
  rim.position.set(4.5, 1.8, 2.8);
  scene.add(rim);

  const glassKey = new THREE.PointLight(0xffffff, 18, 10, 2);
  glassKey.position.set(-2.2, 2.4, 4.6);
  scene.add(glassKey);

  const glassRim = new THREE.PointLight(0xead1b2, 13, 9, 2);
  glassRim.position.set(2.9, .4, 3.4);
  scene.add(glassRim);

  const fill = new THREE.PointLight(0xc8d6ff, 8.5, 12, 2);
  fill.position.set(2.6, -1.2, 3.8);
  scene.add(fill);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(20, 20),
    new THREE.MeshStandardMaterial({ color: 0x080808, roughness: .82, metalness: .12 })
  );
  floor.rotation.x = Math.PI / 2;
  floor.position.y = -2.05;
  floor.receiveShadow = true;
  scene.add(floor);
}

function resize() {
  if (!renderer || !camera) return;
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatioCap));
  renderer.setSize(width, height, false);
}

function render() {
  animationFrame = requestAnimationFrame(render);
  controls?.update();
  renderer?.render(scene, camera);
}

async function initialise() {
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !lowMemory,
      alpha: false,
      powerPreference: lowMemory ? "low-power" : "high-performance"
    });
  } catch (error) {
    showFallback("3D VIEWER UNAVAILABLE ON THIS DEVICE");
    return;
  }

  renderer.setClearColor(0x050505, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = !lowMemory;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x050505, .035);

  camera = new THREE.PerspectiveCamera(33, 1, .05, 100);
  camera.position.set(0, .12, 5.8);

  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = !prefersReducedMotion;
  controls.dampingFactor = .075;
  controls.enablePan = false;
  controls.minDistance = 3.3;
  controls.maxDistance = 8;
  controls.minPolarAngle = Math.PI * .2;
  controls.maxPolarAngle = Math.PI * .8;
  controls.rotateSpeed = coarsePointer ? .52 : .35;
  controls.zoomSpeed = .72;
  controls.listenToKeyEvents(window);
  controls.addEventListener("start", markInteraction);

  addEnvironment();
  resize();

  const videoTexture = new THREE.VideoTexture(video);
  videoTexture.colorSpace = THREE.SRGBColorSpace;
  videoTexture.minFilter = THREE.LinearFilter;
  videoTexture.magFilter = THREE.LinearFilter;
  videoTexture.generateMipmaps = false;
  videoTexture.flipY = true;

  const loader = new GLTFLoader();
  loader.load(
    "./assets/digital-frame-labelled.glb",
    (gltf) => {
      try {
        configureModel(gltf, videoTexture);
        modelProgress = 100;
        modelReady = true;
        updateCombinedProgress();
      } catch (error) {
        console.error("GTHEFIGHTER model setup failed", error);
        showFallback("DIGITAL FRAME COULD NOT BE DISPLAYED");
      }
    },
    (event) => {
      if (!event.total) return;
      modelProgress = Math.min(99, (event.loaded / event.total) * 100);
      updateCombinedProgress();
    },
    (error) => {
      console.error("GTHEFIGHTER model failed to load", error);
      showFallback("DIGITAL FRAME COULD NOT BE LOADED");
    }
  );

  render();
}

function markVideoReady() {
  markVideoUsable();
}

video.addEventListener("loadedmetadata", markVideoReady, { once: true });
video.addEventListener("loadeddata", markVideoReady, { once: true });
video.addEventListener("canplay", markVideoReady, { once: true });
video.addEventListener("error", () => {
  console.error("GTHEFIGHTER artwork video failed to load");
  videoReady = true;
  updateCombinedProgress();
}, { once: true });

if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
  markVideoReady();
}

document.addEventListener("touchstart", attemptArtworkVideoPlayback, {
  once: true,
  passive: true
});
document.addEventListener("pointerdown", attemptArtworkVideoPlayback, {
  once: true,
  passive: true
});
window.setTimeout(() => {
  if (!videoReady) markVideoUsable();
}, 1800);
resetButton.addEventListener("click", resetView);
canvas.addEventListener("pointerdown", markInteraction, { once: true });
window.addEventListener("resize", resize, { passive: true });
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    video.pause();
  } else {
    attemptArtworkVideoPlayback();
  }
});
window.addEventListener("pagehide", () => {
  cancelAnimationFrame(animationFrame);
  video.pause();
  renderer?.dispose();
  environmentRenderTarget?.dispose();
}, { once: true });

prepareArtworkVideo();
initialise();
