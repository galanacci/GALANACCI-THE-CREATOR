import * as THREE from "./vendor/three/three.module.js";
import { GLTFLoader } from "./vendor/three/GLTFLoader.js";
import { getPerformanceTier } from "./performance-tier.js";

const ASSETS = Object.freeze({
    workspace: "./assets/workspace-scan-optimized.glb"
});

// Spatial calibration remains isolated here so the room can evolve without rebuilding its interaction layer.
export const VIDEO_JOURNAL_LAYOUT = Object.freeze({
    workspaceWidth: 6.2,
    camera: Object.freeze({
        position: Object.freeze([0, 0.08, 3.4]),
        target: Object.freeze([0, 0.08, 0]),
        entrance: Object.freeze({ duration: 3400, x: -0.3, y: 0.12, z: 1.45 })
    })
});

let retainedScene;

export function mountVideoJournalScene(host, hooks = {}) {
    retainedScene ||= new VideoJournalScene();
    retainedScene.attach(host, hooks);
    return retainedScene;
}

class VideoJournalScene {
    constructor() {
        this.performanceTier = getPerformanceTier();
        const mobile = innerWidth < 760;
        const pixelRatioLimit = mobile
            ? this.performanceTier === "high" ? 1.25 : this.performanceTier === "balanced" ? 1 : .8
            : this.performanceTier === "low" ? 1 : 1.5;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x090604);
        this.scene.fog = new THREE.FogExp2(0x090604, 0.048);
        this.camera = new THREE.PerspectiveCamera(39, 1, 0.05, 40);
        this.renderer = new THREE.WebGLRenderer({
            antialias: this.performanceTier !== "low",
            powerPreference: this.performanceTier === "high" ? "high-performance" : "low-power"
        });
        this.renderer.setPixelRatio(Math.min(devicePixelRatio, pixelRatioLimit));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 0.79;
        this.renderer.domElement.className = "documentary-renderer";
        this.renderer.domElement.dataset.cameraMode = "entrance-pan";
        this.renderer.domElement.tabIndex = -1;
        this.renderer.domElement.setAttribute("aria-hidden", "true");
        this.loader = new GLTFLoader();
        this.scene.environment = this.createStudioEnvironment();
        this.scene.environmentIntensity = 0.78;
        this.clock = new THREE.Clock();
        this.loaded = false;
        this.failed = false;
        this.frame = 0;
        this.lastRenderAt = 0;
        this.minimumFrameInterval = this.performanceTier === "low" ? 1000 / 30 : 0;
        this.bootPromise = null;
        this.screenMode = "off";
        this.staticFrame = 0;
        this.televisionMeshes = [];
        this.optimizedTextures = new WeakSet();
        this.cameraTarget = new THREE.Vector3(...VIDEO_JOURNAL_LAYOUT.camera.target);
        this.entranceTarget = this.cameraTarget.clone();
        this.cameraEntranceStart = null;
        this.lastScreenRect = "";

        this.screenCanvas = document.createElement("canvas");
        this.screenCanvas.width = this.performanceTier === "high" ? 512 : 384;
        this.screenCanvas.height = this.performanceTier === "high" ? 384 : 288;
        this.screenContext = this.screenCanvas.getContext("2d", { alpha: false });
        this.screenTexture = new THREE.CanvasTexture(this.screenCanvas);
        this.screenTexture.colorSpace = THREE.SRGBColorSpace;
        this.screenTexture.minFilter = THREE.LinearFilter;
        this.screenTexture.flipY = false;
        this.drawScreen("off");

        this.scene.add(new THREE.HemisphereLight(0xd6a06a, 0x090504, .48));
        // The original scan was lit by a practical above and to the camera's right.
        // Keeping the source camera-relative preserves that authentic highlight during the entrance pan.
        this.cameraLight = new THREE.PointLight(0xffc78f, 1.05, 7.5, 1.8);
        this.cameraLight.position.set(1.15, 0.92, 0.38);
        this.camera.add(this.cameraLight);
        this.scene.add(this.camera);
        this.screenGlow = new THREE.PointLight(0x8fcfe5, 0, 2.6, 2);
        this.screenGlow.position.set(0.08, 0.18, 1.55);
        this.scene.add(this.screenGlow);
        this.screenSpill = new THREE.SpotLight(0xa9cfca, 0, 3.8, Math.PI * .24, .78, 2);
        this.scene.add(this.screenSpill, this.screenSpill.target);
        this.screenPool = this.createScreenPool();
        this.scene.add(this.screenPool);
        this.baseShadow = this.createBaseShadow();
        this.scene.add(this.baseShadow);

        this.tick = this.tick.bind(this);
        this.onResize = this.onResize.bind(this);
        this.load();
    }

    createStudioEnvironment() {
        const studio = new THREE.Scene();
        studio.background = new THREE.Color(0x0d0907);
        const panel = (colour, size, position) => {
            const mesh = new THREE.Mesh(
                new THREE.PlaneGeometry(...size),
                new THREE.MeshBasicMaterial({ color: colour, side: THREE.DoubleSide })
            );
            mesh.position.set(...position);
            mesh.lookAt(0, 0, 0);
            studio.add(mesh);
            return mesh;
        };
        panel(0xffc078, [5.5, 3.2], [3.8, 4.5, 4.2]);
        panel(0x6c5140, [3.4, 4.8], [-4.6, 1.2, 3.2]);
        panel(0x8a421f, [5.8, 2.5], [-2.4, -3.5, 1.5]);
        const generator = new THREE.PMREMGenerator(this.renderer);
        const target = generator.fromScene(studio, .08);
        generator.dispose();
        studio.traverse((node) => {
            node.geometry?.dispose?.();
            node.material?.dispose?.();
        });
        return target.texture;
    }

    createScreenPool() {
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 128;
        const context = canvas.getContext("2d");
        const glow = context.createRadialGradient(128, 64, 4, 128, 64, 126);
        glow.addColorStop(0, "rgba(205,238,234,.72)");
        glow.addColorStop(.36, "rgba(159,207,202,.32)");
        glow.addColorStop(1, "rgba(92,142,138,0)");
        context.fillStyle = glow;
        context.fillRect(0, 0, canvas.width, canvas.height);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        const material = new THREE.SpriteMaterial({
            map: texture,
            color: 0xa9cfca,
            transparent: true,
            opacity: 0,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            toneMapped: false
        });
        const pool = new THREE.Sprite(material);
        pool.scale.set(2.8, .68, 1);
        pool.renderOrder = 1;
        return pool;
    }

    createBaseShadow() {
        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 64;
        const context = canvas.getContext("2d");
        const shadow = context.createRadialGradient(128, 32, 8, 128, 32, 126);
        shadow.addColorStop(0, "rgba(0,0,0,.98)");
        shadow.addColorStop(.58, "rgba(0,0,0,.86)");
        shadow.addColorStop(1, "rgba(0,0,0,0)");
        context.fillStyle = shadow;
        context.fillRect(0, 0, canvas.width, canvas.height);
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({
            map: texture,
            color: 0x000000,
            transparent: true,
            opacity: .82,
            depthTest: false,
            depthWrite: false,
            toneMapped: false
        });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(2.05, .32, 1);
        sprite.renderOrder = 3;
        return sprite;
    }

    async load() {
        try {
            const workspace = await this.loadAsset(ASSETS.workspace);
            this.prepareWorkspace(workspace.scene);
            this.loaded = true;
            this.hooks?.onReady?.();
            this.start();
        } catch (error) {
            this.failed = true;
            console.error("UNCUT workspace could not be loaded.", error);
            this.hooks?.onError?.(error);
        }
    }

    loadAsset(url) {
        return new Promise((resolve, reject) => this.loader.load(url, resolve, undefined, reject));
    }

    prepareWorkspace(root) {
        root.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(root);
        const size = box.getSize(new THREE.Vector3());
        const centre = box.getCenter(new THREE.Vector3());
        const scale = VIDEO_JOURNAL_LAYOUT.workspaceWidth / size.x;
        root.position.sub(centre);
        root.scale.setScalar(scale);
        root.traverse((node) => {
            if (!node.isMesh) return;
            node.castShadow = false;
            node.receiveShadow = false;
            const materials = [].concat(node.material || []).map((material) => {
                const materialName = material?.name || "";
                const isTelevision = /^TV(?:front|screen|back)$/i.test(materialName);
                if (isTelevision) {
                    node.userData.isTelevision = true;
                    if (!this.televisionMeshes.includes(node)) this.televisionMeshes.push(node);
                }
                if (/^TVScreen$/i.test(materialName)) {
                    this.screenMesh = node;
                    return new THREE.MeshBasicMaterial({
                        name: "TVScreenInteractive",
                        map: this.screenTexture,
                        color: 0xffffff,
                        toneMapped: false
                    });
                }
                if (!material?.map) return material;
                this.optimizeTextureForTier(material.map);
                material.map.colorSpace = THREE.SRGBColorSpace;
                const anisotropyLimit = this.performanceTier === "high" ? 4 : this.performanceTier === "balanced" ? 2 : 1;
                material.map.anisotropy = Math.min(anisotropyLimit, this.renderer.capabilities.getMaxAnisotropy());
                if (/^TV(?:front|back)$/i.test(materialName)) {
                    const televisionMaterial = material.clone();
                    televisionMaterial.name = materialName;
                    televisionMaterial.map = material.map;
                    televisionMaterial.color.multiplyScalar(.88);
                    televisionMaterial.envMapIntensity = .45;
                    televisionMaterial.needsUpdate = true;
                    return televisionMaterial;
                }
                return new THREE.MeshBasicMaterial({
                    name: materialName,
                    map: material.map,
                    color: /^Unnamed$/i.test(materialName) ? 0xc18a60 : 0xc4a88e,
                    side: material.side
                });
            });
            node.material = Array.isArray(node.material) ? materials : materials[0];
        });
        this.workspace = root;
        this.scene.add(root);
        root.updateMatrixWorld(true);
        const televisionBox = this.televisionMeshes.length
            ? new THREE.Box3().setFromObject(this.televisionMeshes[0])
            : null;
        this.televisionMeshes.slice(1).forEach((mesh) => televisionBox?.expandByObject(mesh));
        if (televisionBox && !televisionBox.isEmpty()) {
            const televisionCentre = televisionBox.getCenter(new THREE.Vector3());
            this.cameraTarget.copy(televisionCentre);
            this.entranceTarget.copy(televisionCentre);
            this.screenGlow.position.copy(televisionCentre);
            this.screenGlow.position.y += 0.12;
            this.screenGlow.position.z += 0.32;
            this.screenSpill.position.copy(televisionCentre);
            this.screenSpill.position.z += 0.2;
            this.screenSpill.target.position.copy(televisionCentre);
            this.screenSpill.target.position.y -= 0.72;
            this.screenSpill.target.position.z += 1.35;
            this.screenPool.position.copy(televisionCentre);
            this.screenPool.position.y -= 1.28;
            this.screenPool.position.z += 0.92;
            this.baseShadow.position.copy(televisionCentre);
            this.baseShadow.position.y -= 0.76;
            this.baseShadow.position.z += 0.42;
            this.placeTelevisionLights(televisionCentre);
        }
    }

    optimizeTextureForTier(texture) {
        if (!texture?.image || this.performanceTier === "high" || this.optimizedTextures.has(texture)) return;
        this.optimizedTextures.add(texture);
        const source = texture.image;
        const width = source.width || source.videoWidth || 0;
        const height = source.height || source.videoHeight || 0;
        const maximumDimension = this.performanceTier === "low" ? 512 : 1024;
        if (!width || !height || Math.max(width, height) <= maximumDimension) return;
        const scale = maximumDimension / Math.max(width, height);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const context = canvas.getContext("2d", { alpha: true });
        if (!context) return;
        context.drawImage(source, 0, 0, canvas.width, canvas.height);
        texture.image = canvas;
        texture.needsUpdate = true;
    }

    placeTelevisionLights(centre) {
        this.televisionLights?.removeFromParent();
        const rig = new THREE.Group();
        const addDirectional = (colour, intensity, offset) => {
            const light = new THREE.DirectionalLight(colour, intensity);
            light.position.copy(centre).add(new THREE.Vector3(...offset));
            light.target.position.copy(centre);
            rig.add(light, light.target);
        };
        addDirectional(0xffbd72, 2.7, [2.8, 3.4, 4.8]);
        addDirectional(0x826552, .42, [-3.1, 1.2, 3.5]);
        addDirectional(0xff7937, .72, [-3.4, 1.8, -2.2]);
        this.televisionLights = rig;
        this.scene.add(rig);
    }

    attach(host, hooks) {
        this.detach();
        this.host = host;
        this.hooks = hooks;
        host.prepend(this.renderer.domElement);
        this.resizeObserver = new ResizeObserver(this.onResize);
        this.resizeObserver.observe(host);
        this.onResize();
        if (this.loaded) {
            hooks.onReady?.();
        }
        else if (this.failed) hooks.onError?.();
        this.start();
    }

    beginCameraEntrance() {
        this.cameraEntranceStart = performance.now();
        this.lastScreenRect = "";
    }

    beginEntrance() {
        this.beginCameraEntrance();
        this.start();
    }

    detach() {
        this.stop();
        this.resizeObserver?.disconnect();
        this.renderer.domElement.remove();
        this.host = null;
        this.hooks = null;
    }

    onResize() {
        if (!this.host) return;
        const { width, height } = this.host.getBoundingClientRect();
        if (width < 1 || height < 1) return;
        this.renderer.setSize(width, height, false);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.lastScreenRect = "";
        this.start();
    }

    emitScreenRect() {
        if (!this.screenMesh || !this.host || !this.hooks?.onScreenRect) return;
        const { width, height } = this.host.getBoundingClientRect();
        if (width < 1 || height < 1) return;
        this.screenMesh.updateWorldMatrix(true, false);
        this.camera.updateMatrixWorld();
        const box = new THREE.Box3().setFromObject(this.screenMesh);
        const min = box.min;
        const max = box.max;
        const corners = [
            [min.x,min.y,min.z],[min.x,min.y,max.z],[min.x,max.y,min.z],[min.x,max.y,max.z],
            [max.x,min.y,min.z],[max.x,min.y,max.z],[max.x,max.y,min.z],[max.x,max.y,max.z]
        ].map(([x,y,z]) => new THREE.Vector3(x,y,z).project(this.camera));
        const left = Math.max(0, Math.min(...corners.map((point) => (point.x + 1) * .5 * width)));
        const right = Math.min(width, Math.max(...corners.map((point) => (point.x + 1) * .5 * width)));
        const top = Math.max(0, Math.min(...corners.map((point) => (1 - point.y) * .5 * height)));
        const bottom = Math.min(height, Math.max(...corners.map((point) => (1 - point.y) * .5 * height)));
        const rect = {
            left: Math.round(left),
            top: Math.round(top),
            width: Math.round(Math.max(0, right - left)),
            height: Math.round(Math.max(0, bottom - top))
        };
        const signature = `${rect.left}:${rect.top}:${rect.width}:${rect.height}`;
        if (signature === this.lastScreenRect) return;
        this.lastScreenRect = signature;
        this.hooks.onScreenRect(rect);
    }

    reset() {
        this.bootPromise = null;
        this.screenMode = "off";
        this.screenGlow.intensity = 0;
        this.screenSpill.intensity = 0;
        this.screenPool.material.opacity = 0;
        this.drawScreen("off");
        this.start();
    }

    boot() {
        if (this.bootPromise) return this.bootPromise;
        this.bootPromise = (async () => {
            this.hooks?.onCrtPower?.();
            this.screenMode = "line";
            this.screenGlow.intensity = 1.15;
            this.screenSpill.intensity = .16;
            this.screenPool.material.opacity = .045;
            this.drawScreen("line");
            await this.wait(260);
            this.screenMode = "static";
            this.screenGlow.intensity = 3.1;
            this.screenSpill.intensity = .7;
            this.screenPool.material.opacity = .15;
            this.hooks?.onCrtStaticStart?.(550);
            await this.wait(550);
            this.hooks?.onCrtStaticEnd?.();
            this.screenMode = "tracking";
            this.screenGlow.intensity = 2.45;
            this.screenSpill.intensity = .46;
            this.screenPool.material.opacity = .1;
            this.drawScreen("tracking");
            await this.wait(450);
            this.screenMode = "ready";
            this.screenGlow.intensity = 2.15;
            this.screenSpill.intensity = .36;
            this.screenPool.material.opacity = .085;
            this.drawScreen("ready");
            await this.wait(440);
        })();
        return this.bootPromise;
    }

    beginPlayback() {
        this.screenMode = "playback";
        this.screenGlow.intensity = 1.35;
        this.screenSpill.intensity = .28;
        this.screenPool.material.opacity = .065;
        this.drawScreen("playback");
        this.start();
    }

    beginChannelBlackout() {
        this.screenMode = "off";
        this.screenGlow.intensity = 0;
        this.screenSpill.intensity = 0;
        this.screenPool.material.opacity = 0;
        this.drawScreen("off");
        this.start();
    }

    beginChannelLine() {
        this.screenMode = "line";
        this.screenGlow.intensity = 1.15;
        this.screenSpill.intensity = .12;
        this.screenPool.material.opacity = .035;
        this.drawScreen("line");
        this.start();
    }

    beginChannelStatic() {
        this.screenMode = "static";
        this.screenGlow.intensity = 2.65;
        this.screenSpill.intensity = .58;
        this.screenPool.material.opacity = .12;
        this.drawScreen("static");
        this.start();
    }

    beginChannelTracking() {
        this.screenMode = "tracking";
        this.screenGlow.intensity = 1.8;
        this.screenSpill.intensity = .3;
        this.screenPool.material.opacity = .06;
        this.drawScreen("tracking");
        this.start();
    }

    wait(duration) {
        return new Promise((resolve) => window.setTimeout(resolve, duration));
    }

    drawScreen(mode) {
        const context = this.screenContext;
        const { width, height } = this.screenCanvas;
        this.renderer.domElement.dataset.screenMode = mode;
        context.fillStyle = mode === "off" ? "#070807" : "#020303";
        context.fillRect(0, 0, width, height);
        if (mode === "line") {
            const gradient = context.createLinearGradient(0, height / 2 - 8, 0, height / 2 + 8);
            gradient.addColorStop(0, "rgba(220,245,240,0)");
            gradient.addColorStop(.5, "rgba(235,255,250,1)");
            gradient.addColorStop(1, "rgba(220,245,240,0)");
            context.fillStyle = gradient;
            context.fillRect(0, height / 2 - 10, width, 20);
        } else if (mode === "static") {
            const image = context.createImageData(width, height);
            for (let index = 0; index < image.data.length; index += 4) {
                const value = Math.random() * 210;
                image.data[index] = value;
                image.data[index + 1] = value;
                image.data[index + 2] = value;
                image.data[index + 3] = 255;
            }
            context.putImageData(image, 0, 0);
        } else if (mode === "tracking" || mode === "ready") {
            const shift = mode === "tracking" ? Math.sin(performance.now() * .02) * height * .12 : 0;
            const glow = context.createLinearGradient(0,height * .34 + shift,0,height * .66 + shift);
            glow.addColorStop(0,"rgba(205,218,210,0)");
            glow.addColorStop(.44,mode === "tracking" ? "rgba(205,218,210,.08)" : "rgba(205,218,210,.025)");
            glow.addColorStop(.5,mode === "tracking" ? "rgba(225,236,229,.18)" : "rgba(225,236,229,.06)");
            glow.addColorStop(.56,mode === "tracking" ? "rgba(205,218,210,.08)" : "rgba(205,218,210,.025)");
            glow.addColorStop(1,"rgba(205,218,210,0)");
            context.fillStyle = glow;
            context.fillRect(0,0,width,height);
        }
        this.drawGlassReflection(mode);
        context.fillStyle = "rgba(0,0,0,.18)";
        for (let y = 0; y < height; y += 4) context.fillRect(0, y, width, 2);
        this.screenTexture.needsUpdate = true;
    }

    drawGlassReflection(mode) {
        const context = this.screenContext;
        const { width, height } = this.screenCanvas;
        const strength = mode === "off" ? 1 : mode === "line" ? .58 : .16;
        context.save();
        context.globalCompositeOperation = "screen";

        const roomGlow = context.createRadialGradient(width * .78, height * .02, 4, width * .67, height * .25, width * .72);
        roomGlow.addColorStop(0, `rgba(255,218,174,${.19 * strength})`);
        roomGlow.addColorStop(.34, `rgba(191,157,122,${.075 * strength})`);
        roomGlow.addColorStop(1, "rgba(0,0,0,0)");
        context.fillStyle = roomGlow;
        context.fillRect(0, 0, width, height);

        const glassCurve = context.createLinearGradient(0, 0, 0, height);
        glassCurve.addColorStop(0, `rgba(210,216,209,${.08 * strength})`);
        glassCurve.addColorStop(.13, `rgba(145,151,146,${.03 * strength})`);
        glassCurve.addColorStop(.58, "rgba(0,0,0,0)");
        glassCurve.addColorStop(1, `rgba(170,145,112,${.022 * strength})`);
        context.fillStyle = glassCurve;
        context.fillRect(0, 0, width, height);

        context.globalCompositeOperation = "multiply";
        const edgeFalloff = context.createRadialGradient(width / 2, height / 2, width * .22, width / 2, height / 2, width * .65);
        edgeFalloff.addColorStop(0, "rgba(255,255,255,1)");
        edgeFalloff.addColorStop(.72, "rgba(235,235,235,.96)");
        edgeFalloff.addColorStop(1, "rgba(32,32,32,.82)");
        context.fillStyle = edgeFalloff;
        context.fillRect(0, 0, width, height);
        context.restore();
    }

    start() {
        if (this.frame || !this.host?.isConnected || document.hidden) return;
        this.clock.start();
        this.frame = requestAnimationFrame(this.tick);
    }

    stop() {
        cancelAnimationFrame(this.frame);
        this.frame = 0;
        this.clock.stop();
    }

    tick(now) {
        this.frame = 0;
        if (!this.host?.isConnected || document.hidden) return;
        if (this.minimumFrameInterval && now - this.lastRenderAt < this.minimumFrameInterval) {
            this.frame = requestAnimationFrame(this.tick);
            return;
        }
        this.lastRenderAt = now;
        const elapsed = this.clock.getElapsedTime();
        const cameraConfig = VIDEO_JOURNAL_LAYOUT.camera;
        const entrance = cameraConfig.entrance;
        const mobile = innerWidth < 760;
        const baseZ = mobile ? 4.8 : cameraConfig.position[2];
        const progress = this.cameraEntranceStart === null
            ? 1
            : Math.min(1, (performance.now() - this.cameraEntranceStart) / entrance.duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        const mobileScale = mobile ? .72 : 1;
        this.camera.position.set(
            this.cameraTarget.x + cameraConfig.position[0] + THREE.MathUtils.lerp(entrance.x * mobileScale, 0, eased),
            this.cameraTarget.y + cameraConfig.position[1] + THREE.MathUtils.lerp(entrance.y * mobileScale, 0, eased),
            this.cameraTarget.z + baseZ + THREE.MathUtils.lerp(entrance.z * mobileScale, 0, eased)
        );
        this.entranceTarget.set(
            this.cameraTarget.x + THREE.MathUtils.lerp(.12 * mobileScale, 0, eased),
            this.cameraTarget.y + THREE.MathUtils.lerp(-.045 * mobileScale, 0, eased),
            this.cameraTarget.z
        );
        this.camera.lookAt(this.entranceTarget);
        if (progress === 1) this.cameraEntranceStart = null;
        if (this.screenMode === "static" && elapsed - this.staticFrame > .055) {
            this.staticFrame = elapsed;
            this.drawScreen("static");
        }
        if (this.screenMode === "tracking" && elapsed - this.staticFrame > .09) {
            this.staticFrame = elapsed;
            this.drawScreen("tracking");
        }
        this.renderer.render(this.scene, this.camera);
        this.emitScreenRect();
        const needsContinuousFrames = this.cameraEntranceStart !== null
            || this.screenMode === "static"
            || this.screenMode === "tracking";
        if (needsContinuousFrames) this.frame = requestAnimationFrame(this.tick);
        else this.clock.stop();
    }
}
