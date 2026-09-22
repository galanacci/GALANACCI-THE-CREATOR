import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";


/* GTC GTHEFIGHTER UI FIX V1 START */
const __gtcGthefighterUiFix = (() => {
  const HIDE_PATTERNS = [
    /^GALANACCI PRESENTS$/i,
    /^G THE FIGHTER$/i,
    /^CREATED$/i,
    /^CREATOR$/i,
    /^GALANACCI$/i,
    /^\d{4}$/,
    /A DIGITAL ART COLLECTION EXPLORING BOXING'?S GREATS\.?/i
  ];

  const KEEP_PATTERNS = [
    /RESET VIEW/i,
    /DRAG/i,
    /ROTATE/i,
    /SCROLL/i,
    /PINCH/i,
    /ZOOM/i,
    /TAP/i,
    /INSTRUCTION/i
  ];

  function applyAcrylicToMaterial(material) {
    if (!material) return;

    const mats = Array.isArray(material) ? material : [material];

    mats.forEach((mat) => {
      if (!mat || typeof mat !== 'object') return;

      if ('metalness' in mat) mat.metalness = 0.06;
      if ('roughness' in mat) mat.roughness = 0.2;
      if ('clearcoat' in mat) mat.clearcoat = 1;
      if ('clearcoatRoughness' in mat) mat.clearcoatRoughness = 0.1;
      if ('reflectivity' in mat) mat.reflectivity = 1;
      if ('ior' in mat) mat.ior = 1.49;
      if ('thickness' in mat) mat.thickness = 0.45;
      if ('transmission' in mat) mat.transmission = 0.04;
      if ('sheen' in mat) mat.sheen = 1;
      if ('sheenRoughness' in mat) mat.sheenRoughness = 0.48;
      if ('envMapIntensity' in mat) mat.envMapIntensity = Math.max(mat.envMapIntensity || 0, 1.15);

      if ('transparent' in mat) mat.transparent = true;
      if ('opacity' in mat) mat.opacity = Math.min(typeof mat.opacity === 'number' ? Math.max(mat.opacity, 0.18) : 0.22, 0.42);

      mat.needsUpdate = true;
    });
  }

  function meshName(node) {
    const material = Array.isArray(node?.material) ? node.material[0] : node?.material;
    const nameBits = [
      node?.name || '',
      material?.name || '',
      node?.userData?.name || '',
      node?.userData?.label || ''
    ];

    return nameBits.join(' ').toLowerCase();
  }

  function isDark(material) {
    const mat = Array.isArray(material) ? material[0] : material;
    if (!mat || !mat.color) return false;
    return mat.color.r < 0.1 && mat.color.g < 0.1 && mat.color.b < 0.1;
  }

  function isLikelyBackgroundMesh(node, THREE) {
    if (!node || !node.isMesh || !node.geometry || !node.material) return false;

    if (!isDark(node.material)) return false;

    const name = meshName(node);
    if (/(background|backdrop|wall|plane)/.test(name)) return true;

    try {
      if (!node.geometry.boundingBox) {
        node.geometry.computeBoundingBox();
      }

      const size = new THREE.Vector3();
      node.geometry.boundingBox.getSize(size);

      return size.x > 8 || size.y > 8 || size.z > 8;
    } catch (_error) {
      return false;
    }
  }

  function convertToUnlitBackground(node, THREE) {
    if (!node || !node.isMesh) return;

    const originalMaterial = Array.isArray(node.material) ? node.material[0] : node.material;
    const color = originalMaterial?.color ? originalMaterial.color.clone() : new THREE.Color(0x000000);

    node.material = new THREE.MeshBasicMaterial({
      color,
      transparent: false,
      toneMapped: false,
      fog: false
    });

    node.renderOrder = -1000;
  }

  function shouldReceiveAcrylic(node) {
    if (!node || !node.isMesh || !node.material) return false;

    const name = meshName(node);

    if (/(background|backdrop|wall|plane)/.test(name)) return false;
    if (/(frame|back|backing|plate|panel|glass|acrylic|screen|cover)/.test(name)) return true;

    const mat = Array.isArray(node.material) ? node.material[0] : node.material;

    if (!mat) return false;

    if (mat.isMeshPhysicalMaterial) return true;
    if (mat.transparent) return true;
    if (isDark(mat)) return true;

    return false;
  }

  function addFrameLights(scene, THREE) {
    if (!scene || scene.userData.__gtcFrameLightsAdded) return;
    scene.userData.__gtcFrameLightsAdded = true;

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.15);
    keyLight.position.set(2.3, 1.8, 3.2);
    keyLight.name = 'gtcUiFixKeyLight';

    const rimLight = new THREE.DirectionalLight(0xffffff, 0.75);
    rimLight.position.set(-2.4, 0.9, 2.5);
    rimLight.name = 'gtcUiFixRimLight';

    scene.add(keyLight);
    scene.add(rimLight);
  }

  function restyleScene(scene, THREE) {
    if (!scene || scene.userData.__gtcUiFixStyled) return;
    scene.userData.__gtcUiFixStyled = true;

    try {
      if ('background' in scene) {
        scene.background = new THREE.Color(0x000000);
      }
    } catch (_error) {}

    scene.traverse((node) => {
      if (!node || !node.isMesh) return;

      if (isLikelyBackgroundMesh(node, THREE)) {
        convertToUnlitBackground(node, THREE);
        return;
      }

      if (shouldReceiveAcrylic(node)) {
        applyAcrylicToMaterial(node.material);
      }
    });

    addFrameLights(scene, THREE);
  }

  function installThreeHooks(THREE) {
    if (!THREE || THREE.__gtcGthefighterUiFixInstalled) return;

    THREE.__gtcGthefighterUiFixInstalled = true;

    const originalAdd = THREE.Object3D.prototype.add;

    THREE.Object3D.prototype.add = function (...objects) {
      const result = originalAdd.apply(this, objects);

      try {
        if (this && this.isScene) {
          queueMicrotask(() => restyleScene(this, THREE));
        }

        objects.forEach((object) => {
          if (object && object.isScene) {
            queueMicrotask(() => restyleScene(object, THREE));
          }
        });
      } catch (_error) {}

      return result;
    };
  }

  function elementHasKeepText(text) {
    return KEEP_PATTERNS.some((pattern) => pattern.test(text));
  }

  function elementHasHideText(text) {
    return HIDE_PATTERNS.some((pattern) => pattern.test(text));
  }

  function chooseHideTarget(element) {
    let current = element;

    while (current && current !== document.body) {
      const text = (current.textContent || '').replace(/\s+/g, ' ').trim();

      if (elementHasKeepText(text)) {
        break;
      }

      if (
        current.matches &&
        current.matches('p, span, h1, h2, h3, h4, h5, h6, small, strong, em, li, div, section, article, header, footer')
      ) {
        return current;
      }

      current = current.parentElement;
    }

    return element;
  }

  function pruneUi() {
    if (!document.body) return;

    const all = Array.from(document.body.querySelectorAll('*'));

    all.forEach((element) => {
      if (!element || element.classList.contains('gtc-ui-fix-hidden')) return;
      if (element.closest('canvas')) return;
      if (element.querySelector('canvas')) return;
      if (element.tagName === 'SCRIPT' || element.tagName === 'STYLE' || element.tagName === 'LINK') return;

      const text = (element.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text) return;
      if (elementHasKeepText(text)) return;

      if (elementHasHideText(text)) {
        const target = chooseHideTarget(element);
        target.classList.add('gtc-ui-fix-hidden');
      }
    });
  }

  function bootDomFix() {
    pruneUi();
    window.setTimeout(pruneUi, 120);
    window.setTimeout(pruneUi, 500);
    window.setTimeout(pruneUi, 1200);
  }

  return {
    installThreeHooks,
    bootDomFix
  };
})();

try {
  if (typeof THREE !== 'undefined') {
    __gtcGthefighterUiFix.installThreeHooks(THREE);
  } else if (typeof window !== 'undefined' && window.THREE) {
    __gtcGthefighterUiFix.installThreeHooks(window.THREE);
  }
} catch (_error) {}

if (typeof window !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    try { __gtcGthefighterUiFix.bootDomFix(); } catch (_error) {}
  });

  window.addEventListener('load', () => {
    try {
      if (typeof THREE !== 'undefined') {
        __gtcGthefighterUiFix.installThreeHooks(THREE);
      } else if (window.THREE) {
        __gtcGthefighterUiFix.installThreeHooks(window.THREE);
      }
    } catch (_error) {}

    try { __gtcGthefighterUiFix.bootDomFix(); } catch (_error) {}
  });
}
/* GTC GTHEFIGHTER UI FIX V1 END */

const experience = document.querySelector(".experience");
const canvas = document.querySelector("#frame-viewer");
const video = document.querySelector("#fighter-video");
const resetButton = document.querySelector("#reset-view");
const progressBar = document.querySelector("#loading-progress");
const progressLabel = document.querySelector("#loading-percentage");
const loadingState = document.querySelector("#loading-state");
const fallback = document.querySelector("#webgl-fallback");
const artworkSlider = document.querySelector("#artwork-slider");
const artworkCurrent = document.querySelector("#artwork-current");
const artworkTotal = document.querySelector("#artwork-total");

const ARTWORK_STILLS = [
  "./assets/stills/2022-08-220831-oleksandr-usyk.png",
  "./assets/stills/2022-09-jaron-ennis.png",
  "./assets/stills/2022-09-mikey-garcia-2.png",
  "./assets/stills/2022-09-mikey-garcia.png",
  "./assets/stills/2022-10-claressa-shields.png",
  "./assets/stills/2022-10-devin-haney-4.png",
  "./assets/stills/2022-10-george-foreman.png",
  "./assets/stills/2022-10-joe-frazier-5.png",
  "./assets/stills/2022-10-nonito-donaire.png",
  "./assets/stills/2022-10-sugar-ray-robinson.png",
  "./assets/stills/2022-11-evander-holyfield.png",
  "./assets/stills/2022-11-jack-catterall.png",
  "./assets/stills/2022-12-julio-ceaar-chavez.png",
  "./assets/stills/2022-12-lennox-lewis.png",
  "./assets/stills/2023-01-archie-moore.png",
  "./assets/stills/2023-01-jimmy-wilde.png",
  "./assets/stills/2023-01-pernell-whitaker.png",
  "./assets/stills/2023-02-canelo-alvarez.png",
  "./assets/stills/2023-02-errol-spence-jr.png",
  "./assets/stills/2023-02-larry-holmes.png",
  "./assets/stills/2023-02-mike-tyson.png",
  "./assets/stills/2023-02-muhammad-ali.png",
  "./assets/stills/2023-03-dmitry-bivol.png",
  "./assets/stills/2023-03-george-kambosos-jr.png",
  "./assets/stills/2023-03-jessica-mccaskill.png",
  "./assets/stills/2023-03-stephen-fulton.png",
  "./assets/stills/2023-03-terence-crawford.png",
  "./assets/stills/2023-03-vasiliy-lomachenko.png",
  "./assets/stills/2023-04-anthony-joshua.png",
  "./assets/stills/2023-04-katie-taylor.png",
  "./assets/stills/2023-04-manny-pacquiao.png",
  "./assets/stills/2023-05-deontay-wilder.png",
  "./assets/stills/2023-05-devin-haney.png",
  "./assets/stills/2023-05-floyd-mayweather.png",
  "./assets/stills/2023-05-gervonta-davis.png",
  "./assets/stills/2023-05-tyson-fury.png",
  "./assets/stills/2023-05-vergil-ortiz-jr.png",
  "./assets/stills/2023-07-gennady-golovkin.png",
  "./assets/stills/2023-07-seb-fundora.png",
  "./assets/stills/2023-10-chantelle-cameron.png",
  "./assets/stills/2023-10-hugo-micallef.png",
  "./assets/stills/2023-10-larry-holmes.png",
  "./assets/stills/2023-10-mark-magsayo.png",
  "./assets/stills/2023-11-ezzard-charles.png",
  "./assets/stills/2023-11-florian-marku.png",
  "./assets/stills/2023-11-francis-ngannou.png",
  "./assets/stills/2023-12-eumir-marcial.png",
  "./assets/stills/2023-12-jesse-rodriguez.png",
  "./assets/stills/2024-05-joe-smith-jr.png",
  "./assets/stills/2024-08-marcial.png",
  "./assets/stills/2024-08-pacquiao-repost.png",
  "./assets/stills/2024-09-ezzard-charles.png",
  "./assets/stills/2024-09-florian-marku.png",
  "./assets/stills/2024-09-mike-tyson.png",
  "./assets/stills/2024-09-muhammad-ali.png",
  "./assets/stills/2024-09-willie-pep.png",
  "./assets/stills/2024-10-floyd-mayweather.png",
  "./assets/stills/2024-10-francis-ngannou.png",
  "./assets/stills/2025-06-gabriela-fundora.png"
];
const ARTWORK_COUNT = ARTWORK_STILLS.length + 1;

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
let artworkTexture;
let screenMaterial;
let activeStillTexture;
let artworkRequestToken = 0;
let currentArtworkIndex = 0;
const artworkTextureLoader = new THREE.TextureLoader();

function padCounter(value) {
  return String(value).padStart(3, "0");
}

function updateArtworkControls(index) {
  artworkSlider.value = String(index + 1);
  artworkCurrent.textContent = padCounter(index + 1);
  artworkTotal.textContent = padCounter(ARTWORK_COUNT);
  artworkSlider.setAttribute(
    "aria-valuetext",
    `${index === 0 ? "Motion artwork" : "Still artwork"} ${index + 1} of ${ARTWORK_COUNT}`
  );
}

async function selectArtwork(index) {
  const boundedIndex = Math.max(0, Math.min(ARTWORK_COUNT - 1, index));
  const requestToken = ++artworkRequestToken;
  currentArtworkIndex = boundedIndex;
  updateArtworkControls(boundedIndex);

  if (boundedIndex === 0) {
    if (screenMaterial) {
      screenMaterial.map = artworkTexture;
      screenMaterial.needsUpdate = true;
    }
    activeStillTexture?.dispose();
    activeStillTexture = undefined;
    attemptArtworkVideoPlayback();
    return;
  }

  video.pause();

  try {
    const texture = await artworkTextureLoader.loadAsync(ARTWORK_STILLS[boundedIndex - 1]);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.flipY = true;

    if (requestToken !== artworkRequestToken) {
      texture.dispose();
      return;
    }

    const previousTexture = activeStillTexture;
    activeStillTexture = texture;

    if (screenMaterial) {
      screenMaterial.map = texture;
      screenMaterial.needsUpdate = true;
    }

    previousTexture?.dispose();
  } catch (error) {
    if (requestToken !== artworkRequestToken) return;
    console.error("GTHEFIGHTER still artwork failed to load", error);
  }
}

function prepareArtworkVideo() {
  video.muted = true;
  video.defaultMuted = true;
  video.autoplay = true;
  video.loop = true;
  video.playsInline = true;

  video.setAttribute("autoplay", "");
  video.setAttribute("muted", "");
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
}

function attemptArtworkVideoPlayback() {
  if (currentArtworkIndex !== 0) return;
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;

  const playAttempt = video.play();
  if (playAttempt && typeof playAttempt.catch === "function") playAttempt.catch(() => {});
}

function createArtworkTexture() {
  artworkTexture = new THREE.VideoTexture(video);
  artworkTexture.colorSpace = THREE.SRGBColorSpace;
  artworkTexture.minFilter = THREE.LinearFilter;
  artworkTexture.magFilter = THREE.LinearFilter;
  artworkTexture.generateMipmaps = false;
  artworkTexture.flipY = true;
  return artworkTexture;
}
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
  attemptArtworkVideoPlayback();
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
  const frontAcrylic = new THREE.MeshPhysicalMaterial({
    color: 0xf6f4ef,
    metalness: 0,
    roughness: .14,
    transparent: true,
    opacity: .12,
    transmission: 0,
    depthWrite: false,
    clearcoat: 1,
    clearcoatRoughness: .035,
    ior: 1.49,
    envMapIntensity: 3.8,
    specularIntensity: 1,
    specularColor: 0xffffff,
    side: THREE.FrontSide
  });

  const backAcrylic = frontAcrylic.clone();
  backAcrylic.color.setHex(0xf2eee6);
  backAcrylic.roughness = .18;
  backAcrylic.opacity = .14;
  backAcrylic.envMapIntensity = 4.2;

  const chrome = new THREE.MeshPhysicalMaterial({
    color: 0xe6e6e3,
    metalness: .82,
    roughness: .12,
    clearcoat: .72,
    clearcoatRoughness: .08,
    envMapIntensity: 3.2,
    side: THREE.DoubleSide
  });

  const frame = new THREE.MeshPhysicalMaterial({
    color: coarsePointer ? 0x34343a : 0x565660,
    metalness: coarsePointer ? .34 : .22,
    roughness: coarsePointer ? .18 : .2,
    clearcoat: coarsePointer ? .92 : 1,
    clearcoatRoughness: coarsePointer ? .07 : .055,
    envMapIntensity: coarsePointer ? 3.4 : 5.2,
    specularIntensity: 1,
    specularColor: 0xffffff,
    emissive: coarsePointer ? 0x000000 : 0x111116,
    emissiveIntensity: coarsePointer ? 0 : .28,
    side: THREE.DoubleSide
  });

  const screen = new THREE.MeshBasicMaterial({
    map: videoTexture,
    alphaMap: createScreenMask(),
    transparent: true,
    alphaTest: .5,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false
  });

  return {
    frontGlass: frontAcrylic,
    backGlass: backAcrylic,
    chrome,
    frame,
    screen
  };
}
function configureModel(gltf, videoTexture) {
  frameRoot = gltf.scene;
  const meshes = [];
  frameRoot.traverse((object) => {
    if (!object.isMesh) return;
    if (!object.geometry.getAttribute("normal")) {
      object.geometry.computeVertexNormals();
      object.geometry.normalizeNormals();
    }
    meshes.push(object);
    object.castShadow = !lowMemory;
    object.receiveShadow = true;
  });

  if (meshes.length < 3) {
    throw new Error("Digital frame screen mesh was not found.");
  }

  const materials = createMaterials(videoTexture);
  screenMaterial = materials.screen;
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
      // The authored SCREEN is a thick opaque solid. The fitted video plane
      // replaces it so the artwork can occupy the clear cavity between panels.
      mesh.visible = false;
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
  const frontRotation = Math.PI;
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
  frontGlassMesh.geometry.computeBoundingBox();
  const screenBounds = screenMesh.geometry.boundingBox;
  const frontGlassBounds = frontGlassMesh.geometry.boundingBox;
  const screenSize = screenBounds.getSize(new THREE.Vector3());
  const screenCentre = screenBounds.getCenter(new THREE.Vector3());
  const videoSurface = new THREE.Mesh(
    new THREE.PlaneGeometry(screenSize.x * .996, screenSize.y * .996),
    materials.screen
  );
  // The front glass occupies a real volume. Keep the artwork behind its inner
  // face instead of placing it inside the glass where the surfaces can clash.
  videoSurface.position.set(
    screenCentre.x,
    screenCentre.y,
    frontGlassBounds.max.z + .0003
  );
  videoSurface.rotation.y = Math.PI;
  videoSurface.castShadow = false;
  videoSurface.receiveShadow = false;
  backGlassMesh.renderOrder = 1;
  videoSurface.renderOrder = 3;
  frontGlassMesh.renderOrder = 4;
  frameRoot.add(videoSurface);

  const backGlassEdgeReflection = backGlassMesh.clone();
  backGlassEdgeReflection.material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    vertexShader: `
      varying vec3 vViewNormal;
      varying vec3 vViewDirection;

      void main() {
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vViewNormal = normalize(normalMatrix * normal);
        vViewDirection = normalize(-viewPosition.xyz);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      varying vec3 vViewNormal;
      varying vec3 vViewDirection;

      void main() {
        float facing = abs(dot(normalize(vViewNormal), normalize(vViewDirection)));
        float rim = pow(1.0 - facing, 1.35);
        vec3 cream = vec3(0.918, 0.820, 0.698);
        gl_FragColor = vec4(cream, rim * 0.92);
      }
    `
  });
  backGlassEdgeReflection.castShadow = false;
  backGlassEdgeReflection.receiveShadow = false;
  backGlassEdgeReflection.renderOrder = 2;
  frameRoot.add(backGlassEdgeReflection);

  const glassSize = frontGlassBounds.getSize(new THREE.Vector3());
  const glassCentre = frontGlassBounds.getCenter(new THREE.Vector3());
  const glassReflection = new THREE.Mesh(
    new THREE.PlaneGeometry(glassSize.x * .97, glassSize.y * .97),
    new THREE.MeshBasicMaterial({
      map: createGlassReflectionTexture(),
      transparent: true,
      opacity: .58,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      toneMapped: false
    })
  );
  // Keep the reflection clear of the glass surface so it cannot z-fight while
  // still reading as a highlight carried by the rotating front panel.
  glassReflection.position.set(
    glassCentre.x,
    glassCentre.y,
    frontGlassBounds.min.z - .00025
  );
  glassReflection.rotation.y = Math.PI;
  glassReflection.castShadow = false;
  glassReflection.receiveShadow = false;
  glassReflection.renderOrder = 5;
  frameRoot.add(glassReflection);

  scene.add(frameRoot);
  selectArtwork(currentArtworkIndex);
}

function resetView() {
  if (!controls || !camera) return;
  camera.position.set(0, 0, 5.8);
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

  scene.add(new THREE.AmbientLight(0xffffff, .42));

  const hemisphere = new THREE.HemisphereLight(0xffffff, 0x080808, .72);
  scene.add(hemisphere);

  const key = new THREE.DirectionalLight(0xffffff, coarsePointer ? 4.8 : 7.2);
  key.position.set(-4.6, 5.6, 5.8);
  key.castShadow = !lowMemory;
  key.shadow.mapSize.set(lowMemory ? 512 : 1024, lowMemory ? 512 : 1024);
  scene.add(key);

  const rim = new THREE.DirectionalLight(0xead1b2, coarsePointer ? 3.2 : 5.4);
  rim.position.set(4.5, 2.4, 3.6);
  scene.add(rim);

  const acrylicKey = new THREE.PointLight(0xffffff, coarsePointer ? 42 : 62, 11, 2);
  acrylicKey.position.set(-2.7, 3.0, 4.6);
  scene.add(acrylicKey);

  const acrylicRim = new THREE.PointLight(0xead1b2, coarsePointer ? 30 : 46, 10, 2);
  acrylicRim.position.set(3.4, .8, 3.6);
  scene.add(acrylicRim);

  const lowerKick = new THREE.PointLight(0xcbd7ff, coarsePointer ? 18 : 26, 10, 2);
  lowerKick.position.set(2.0, -2.2, 3.5);
  scene.add(lowerKick);

  if (!coarsePointer) {
    const desktopFrontFill = new THREE.PointLight(0xffffff, 34, 12, 2);
    desktopFrontFill.position.set(.2, .8, 5.7);
    scene.add(desktopFrontFill);

    const desktopEdgeLift = new THREE.DirectionalLight(0xd9d9e5, 3.4);
    desktopEdgeLift.position.set(-5.2, -.6, 2.4);
    scene.add(desktopEdgeLift);
  }

  /*
    No floor and no background geometry.
    The renderer clear colour remains pure black.
  */
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
  renderer.toneMappingExposure = coarsePointer ? 1.15 : 1.55;
  renderer.shadowMap.enabled = !lowMemory;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
camera = new THREE.PerspectiveCamera(33, 1, .05, 100);
  camera.position.set(0, 0, 5.8);
controls = new OrbitControls(camera, canvas);
  controls.enableDamping = !prefersReducedMotion;
  controls.dampingFactor = .075;
  controls.enablePan = false;
  controls.minDistance = 3.3;
  controls.maxDistance = 8;
  controls.minPolarAngle = Math.PI * .2;
  controls.maxPolarAngle = Math.PI * .8;
  controls.minAzimuthAngle = -Math.PI * .28;
  controls.maxAzimuthAngle = Math.PI * .28;
  controls.rotateSpeed = coarsePointer ? .52 : .35;
  controls.zoomSpeed = .72;
  controls.listenToKeyEvents(window);
  controls.addEventListener("start", markInteraction);

  addEnvironment();
  resize();
  const videoTexture = createArtworkTexture();

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
  if (videoReady) return;
  videoReady = true;
  updateCombinedProgress();
  attemptArtworkVideoPlayback();
}

video.addEventListener("loadeddata", markVideoReady, { once: true });
video.addEventListener("canplay", markVideoReady, { once: true });
video.addEventListener("error", () => {
  console.error("GTHEFIGHTER artwork video failed to load");
  videoReady = true;
  updateCombinedProgress();
}, { once: true });

if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
  markVideoReady();
}

document.addEventListener("pointerdown", attemptArtworkVideoPlayback, {
  passive: true
});
artworkSlider.max = String(ARTWORK_COUNT);
updateArtworkControls(0);
artworkSlider.addEventListener("input", () => {
  selectArtwork(Number(artworkSlider.value) - 1);
});
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
window.addEventListener("pageshow", () => {
  attemptArtworkVideoPlayback();
  if (renderer && !animationFrame) render();
});
window.addEventListener("pagehide", (event) => {
  cancelAnimationFrame(animationFrame);
  animationFrame = undefined;
  video.pause();
  if (!event.persisted) {
    activeStillTexture?.dispose();
    artworkTexture?.dispose();
    renderer?.dispose();
    environmentRenderTarget?.dispose();
  }
});

prepareArtworkVideo();
initialise();
