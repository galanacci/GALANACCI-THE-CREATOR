const container = document.getElementById('fibonacci-container');
const microphoneStatus = document.getElementById('microphone-status');
const fullscreenButton = document.getElementById('fullscreen-button');
const seeds = 5000;
const phi = (Math.sqrt(5) + 1) / 2 - 1;  // Golden ratio minus 1
let rotation = 0;
let dimensions = { width: window.innerWidth, height: window.innerHeight };

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

// Pulsation variables
let pulsation = 0;
let pulsationSpeed = 0.1;

// Create seeds
const seedElements = new Array(seeds);
for (let i = 0; i < seeds; i++) {
    const seed = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    seed.setAttribute("r", "1");
    seed.setAttribute("fill", "white");
    container.appendChild(seed);
    seedElements[i] = seed;
}

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
        analyzer.fftSize = 256;
        dataArray = new Uint8Array(analyzer.frequencyBinCount);
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
    }
}

// Event listener for the start button
startButton.addEventListener('click', toggleAudio);

// Event listener for desktop devices
document.body.addEventListener('click', function(event) {
    if (event.target !== startButton) {
        toggleAudio();
    }
});

function updatePattern() {
    animationFrame = null;
    if (!isPlaying) return; // Exit if paused

    rotation = (rotation + 0.001) % (2 * Math.PI);
    const scaleFactor = Math.min(dimensions.width, dimensions.height) / 50;

    // Get frequency data
    let bassIntensity;
    if (microphone && analyzer && dataArray) {
        analyzer.getByteFrequencyData(dataArray);
        // Calculate bass intensity (first quarter of frequency bands)
        const bassRange = Math.floor(dataArray.length / 4);
        bassIntensity = dataArray.slice(0, bassRange).reduce((sum, value) => sum + value, 0) / (bassRange * 255);
        // Increase sensitivity by 50%
        bassIntensity = Math.min(1, bassIntensity * 1.5);
    } else {
        bassIntensity = 0.2 + 0.05 * Math.sin(performance.now() * 0.0015);
    }

    // Adjust pulsation speed based on bass intensity
    pulsationSpeed = 0.05 + bassIntensity * 0.2;

    // Sync pulsation with beat
    pulsation += pulsationSpeed * bassIntensity;
    if (pulsation > Math.PI * 2) pulsation -= Math.PI * 2;

    const maxDistance = Math.max(dimensions.width, dimensions.height) / 2;

    for (let i = 0; i < seeds; i++) {
        const angle = i * 2 * Math.PI * phi + rotation;
        const distance = Math.sqrt(i) * scaleFactor;

        const x = Math.cos(angle) * distance;
        const y = Math.sin(angle) * distance;

        // Calculate distance from center
        const distanceFromCenter = Math.sqrt(x * x + y * y);

        // Add some randomness to the ripple effect
        const noise = (Math.random() - 0.5) * 0.2;  // Random value between -0.1 and 0.1
        const adjustedPulsation = pulsation + noise;

        // Calculate scale based on pulsation, distance from center, and noise
        const pulseFactor = Math.sin(adjustedPulsation - distanceFromCenter * 0.05) * 0.5 + 0.5;
        const baseBassScale = 1 + (bassIntensity * 28.8);  // Increased by 20% (24 * 1.2 = 28.8)
        const bassScale = baseBassScale * pulseFactor;

        // Enhanced dissipation effect
        const dissipationFactor = Math.pow(1 - distanceFromCenter / maxDistance, 2);
        const scale = bassScale * dissipationFactor * 1.2;  // Additional 20% increase in overall scale

        const seedX = dimensions.width / 2 + x;
        const seedY = dimensions.height / 2 + y;

        seedElements[i].setAttribute("cx", seedX);
        seedElements[i].setAttribute("cy", seedY);
        seedElements[i].setAttribute("r", Math.max(0.5, scale)); // Ensure minimum size of 0.5
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
    container.setAttribute("width", dimensions.width);
    container.setAttribute("height", dimensions.height);
}

window.addEventListener('resize', handleResize);

handleResize();  // Set initial size
