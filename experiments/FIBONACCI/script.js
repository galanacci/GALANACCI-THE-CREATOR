const container = document.getElementById('fibonacci-container');
const dots = document.getElementById('fibonacci-dots');
const microphoneStatus = document.getElementById('microphone-status');
const fullscreenButton = document.getElementById('fullscreen-button');
const paletteControl = document.getElementById('palette-control');
const paletteButton = document.getElementById('palette-button');
const paletteOptions = document.getElementById('palette-options');
const seeds = 5000;
const phi = (Math.sqrt(5) + 1) / 2 - 1;  // Golden ratio minus 1
let dimensions = { width: window.innerWidth, height: window.innerHeight };
let maxRadius = 0;
let rotation = 0;
let previousFrameAt = null;
let smoothedRotationEnergy = 0;
const seedDistances = new Float32Array(seeds);
const lastRadii = new Int16Array(seeds);
const ripples = [];
const rippleDuration = 1450;
let lastRippleAt = -Infinity;
let previousEnergy = 0;
let ambientEnergy = 0.015;
let lastPreviewRippleAt = -Infinity;
const palettes = {
    mono: '#ffffff',
    cream: '#f2d8b7',
    violet: '#b68ae9'
};
let palette = 'mono';

// Audio context and analyzer
let audioContext, analyzer, dataArray, microphone;
let microphoneStream;
let animationFrame = null;
let hasStarted = false;
let isExpandedWithinOs = false;

function nativeFullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement;
}

function updateFullscreenButton() {
    if (nativeFullscreenElement() && isExpandedWithinOs) {
        setExpandedWithinOs(false);
        return;
    }
    const expanded = Boolean(nativeFullscreenElement() || isExpandedWithinOs);
    if (expanded) closePalette();
    paletteControl.hidden = expanded;
    const label = expanded ? 'Exit fullscreen' : 'Enter fullscreen';
    fullscreenButton.setAttribute('aria-label', label);
    fullscreenButton.setAttribute('aria-pressed', String(expanded));
    fullscreenButton.title = label;
}

function setExpandedWithinOs(expanded) {
    isExpandedWithinOs = expanded;
    if (window.parent !== window) {
        window.parent.postMessage({ type: 'gtc:fibonacci-fullscreen', expanded }, window.location.origin);
    }
    updateFullscreenButton();
}

async function toggleFullscreen(event) {
    event.stopPropagation(); // The visualiser's background click toggles playback.

    if (nativeFullscreenElement()) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (exit) await exit.call(document);
        updateFullscreenButton();
        return;
    }

    if (isExpandedWithinOs) {
        setExpandedWithinOs(false);
        return;
    }

    const enter = document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen;
    if (enter) {
        try {
            await enter.call(document.documentElement);
            if (nativeFullscreenElement()) {
                updateFullscreenButton();
                return;
            }
        } catch {
            // Some mobile browsers expose the API but refuse it for iframe content.
        }
    }

    setExpandedWithinOs(true);
}

fullscreenButton.addEventListener('click', toggleFullscreen);
fullscreenButton.disabled = false;
document.addEventListener('fullscreenchange', updateFullscreenButton);
document.addEventListener('webkitfullscreenchange', updateFullscreenButton);

// Create seeds
const seedElements = new Array(seeds);
for (let i = 0; i < seeds; i++) {
    const seed = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    seed.setAttribute("r", "1");
    seed.setAttribute("fill", "white");
    dots.appendChild(seed);
    seedElements[i] = seed;
}

function setPalette(nextPalette) {
    if (nextPalette !== 'prism' && !palettes[nextPalette]) return;
    palette = nextPalette;
    for (let i = 0; i < seeds; i++) {
        const colour = palette === 'prism'
            ? `hsl(${Math.round((i * phi * 360) % 360)} 85% 68%)`
            : palettes[palette];
        seedElements[i].setAttribute('fill', colour);
    }
    paletteOptions.querySelectorAll('[data-palette]').forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.palette === palette));
    });
    try { localStorage.setItem('fibonacci-palette', palette); } catch { /* Storage may be unavailable. */ }
}

function closePalette() {
    paletteOptions.hidden = true;
    paletteButton.setAttribute('aria-expanded', 'false');
}

paletteButton.addEventListener('click', (event) => {
    event.stopPropagation();
    paletteOptions.hidden = !paletteOptions.hidden;
    paletteButton.setAttribute('aria-expanded', String(!paletteOptions.hidden));
});
paletteOptions.addEventListener('click', (event) => {
    event.stopPropagation();
    const option = event.target.closest('[data-palette]');
    if (!option) return;
    setPalette(option.dataset.palette);
    closePalette();
    paletteButton.focus();
});
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !paletteOptions.hidden) {
        closePalette();
        paletteButton.focus();
    }
});
try { setPalette(localStorage.getItem('fibonacci-palette') || 'mono'); }
catch { setPalette('mono'); }

// Variable to track whether the animation is playing or paused
let isPlaying = false;

const microphoneAvailable = Boolean(navigator.mediaDevices?.getUserMedia);
if (!microphoneAvailable) {
    microphoneStatus.textContent = window.isSecureContext
        ? 'MICROPHONE UNAVAILABLE · VISUAL PREVIEW'
        : 'MICROPHONE REQUIRES HTTPS · VISUAL PREVIEW';
}

// Create a button for mobile devices
const startButton = document.createElement('button');
startButton.textContent = 'TAP TO START';
startButton.style.position = 'fixed';
startButton.style.top = '50%';
startButton.style.left = '50%';
startButton.style.transform = 'translate(-50%, -50%)';
startButton.style.padding = '15px 30px';
startButton.style.fontSize = '18px';
startButton.style.backgroundColor = 'transparent';
startButton.style.color = 'white';
startButton.style.border = 'none';
startButton.style.borderRadius = '15px';
startButton.style.cursor = 'pointer';
startButton.style.zIndex = '1000';
document.body.appendChild(startButton);

// Microphone capture is unavailable on HTTP LAN addresses; the preview still runs.
async function connectMicrophone() {
    try {
        const context = new (window.AudioContext || window.webkitAudioContext)();
        audioContext = context;
        context.resume().catch(() => {});

        microphoneStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        analyzer = context.createAnalyser();
        analyzer.fftSize = 512;
        analyzer.smoothingTimeConstant = 0.65;
        dataArray = new Uint8Array(analyzer.fftSize);
        microphone = context.createMediaStreamSource(microphoneStream);
        microphone.connect(analyzer);
        microphoneStatus.textContent = '';
    } catch {
        microphoneStream?.getTracks().forEach((track) => track.stop());
        microphoneStream = undefined;
        microphone = undefined;
        analyzer = undefined;
        dataArray = undefined;
        if (audioContext) void audioContext.close().catch(() => {});
        audioContext = undefined;
        microphoneStatus.textContent = 'MICROPHONE UNAVAILABLE · VISUAL PREVIEW';
    }
}

// Start or pause audio context and animation
function toggleAudio() {
    if (!hasStarted) {
        hasStarted = true;
        isPlaying = true;
        startButton.style.display = 'none';
        animationFrame = requestAnimationFrame(updatePattern);
        if (microphoneAvailable) void connectMicrophone();
        return;
    }

    isPlaying = !isPlaying;
    if (isPlaying) {
        if (audioContext) void audioContext.resume().catch(() => {});
        if (animationFrame === null) animationFrame = requestAnimationFrame(updatePattern);
    } else {
        if (audioContext) void audioContext.suspend().catch(() => {});
        if (animationFrame !== null) cancelAnimationFrame(animationFrame);
        animationFrame = null;
        previousFrameAt = null;
    }
}

// Event listener for the start button
startButton.addEventListener('click', toggleAudio);

// Event listener for desktop devices
document.body.addEventListener('click', function(event) {
    if (event.target === startButton || event.target.closest('button')) return;
    if (!paletteOptions.hidden) {
        closePalette();
        return;
    }
    toggleAudio();
});

function addRipple(now, strength) {
    ripples.push({ start: now, strength });
    if (ripples.length > 6) ripples.shift();
    lastRippleAt = now;
}

function readSoundEnergy() {
    analyzer.getByteTimeDomainData(dataArray);
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
        const sample = (dataArray[i] - 128) / 128;
        sum += sample * sample;
    }
    return Math.sqrt(sum / dataArray.length);
}

function updatePattern(now) {
    animationFrame = null;
    if (!isPlaying) return; // Exit if paused

    const elapsed = previousFrameAt === null ? 0 : Math.min(now - previousFrameAt, 100);
    previousFrameAt = now;
    let rotationTarget = 0.08;

    if (microphone && analyzer && dataArray) {
        const energy = readSoundEnergy();
        // Follow the room's noise floor slowly so a new sound creates an onset.
        ambientEnergy += (energy - ambientEnergy) * (energy > ambientEnergy ? 0.006 : 0.035);
        rotationTarget = Math.min(1, Math.max(0,
            Math.max(0, energy - ambientEnergy) * 5 + energy * 2.5));
        const onset = energy - previousEnergy;
        if (now - lastRippleAt > 180 && energy > Math.max(0.025, ambientEnergy * 1.45)
            && (onset > 0.009 || now - lastRippleAt > 950)) {
            const strength = Math.min(1.8, Math.max(0.25,
                Math.max(0, energy - ambientEnergy) * 8 + energy * 3));
            addRipple(now, strength);
        }
        previousEnergy = energy;
    } else {
        // Keep the visual preview alive when microphone access is unavailable.
        if (now - lastPreviewRippleAt > 1750) {
            addRipple(now, 0.6);
            lastPreviewRippleAt = now;
        }
    }

    const responseTime = rotationTarget > smoothedRotationEnergy ? 140 : 650;
    smoothedRotationEnergy += (rotationTarget - smoothedRotationEnergy)
        * (1 - Math.exp(-elapsed / responseTime));
    // Keep a gentle idle rotation; loud audio can accelerate it to roughly 5x the old pace.
    rotation = (rotation + elapsed * (0.000009 + smoothedRotationEnergy * 0.000291)) % (2 * Math.PI);
    dots.setAttribute('transform', `rotate(${rotation * 180 / Math.PI} ${dimensions.width / 2} ${dimensions.height / 2})`);

    while (ripples.length && now - ripples[0].start >= rippleDuration) ripples.shift();
    const waveWidth = Math.max(40, maxRadius * 0.12);

    for (let i = 0; i < seeds; i++) {
        let scale = 0.65;
        for (const ripple of ripples) {
            const progress = Math.min(1, (now - ripple.start) / rippleDuration);
            const front = maxRadius * (1 - Math.pow(1 - progress, 2));
            const offset = (seedDistances[i] - front) / waveWidth;
            if (Math.abs(offset) > 2.5) continue;
            const envelope = Math.exp(-offset * offset * 1.6);
            const dissipation = 0.2 + 0.8 * Math.pow(1 - progress, 1.5);
            scale += envelope * ripple.strength * 8.5 * dissipation;
        }
        const radius = Math.round(Math.min(20, scale) * 100);
        if (radius !== lastRadii[i]) {
            seedElements[i].setAttribute('r', (radius / 100).toFixed(2));
            lastRadii[i] = radius;
        }
    }

    animationFrame = requestAnimationFrame(updatePattern);
}

window.addEventListener('pagehide', () => {
    microphoneStream?.getTracks().forEach((track) => track.stop());
    if (audioContext) void audioContext.close().catch(() => {});
});

function handleResize() {
    dimensions.width = window.innerWidth;
    dimensions.height = window.innerHeight;
    maxRadius = Math.hypot(dimensions.width / 2, dimensions.height / 2);
    container.setAttribute("width", dimensions.width);
    container.setAttribute("height", dimensions.height);
    dots.setAttribute('transform', `rotate(${rotation * 180 / Math.PI} ${dimensions.width / 2} ${dimensions.height / 2})`);
    for (let i = 0; i < seeds; i++) {
        const angle = i * 2 * Math.PI * phi;
        const distance = Math.sqrt(i / (seeds - 1)) * maxRadius;
        seedDistances[i] = distance;
        seedElements[i].setAttribute('cx', dimensions.width / 2 + Math.cos(angle) * distance);
        seedElements[i].setAttribute('cy', dimensions.height / 2 + Math.sin(angle) * distance);
    }
}

window.addEventListener('resize', handleResize);

handleResize();  // Set initial size
