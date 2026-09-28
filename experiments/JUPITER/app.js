const viewer = document.querySelector('.viewer');
const video = document.querySelector('#source-video');
const canvas = document.querySelector('#visual');
const status = document.querySelector('#playback-status');
const toggle = document.querySelector('#colour-toggle');
const panel = document.querySelector('#colour-panel');
const visualSource = document.querySelector('#visual-source');
const paletteSelect = document.querySelector('#palette');
const colourStops = document.querySelector('#colour-stops');
const stopInputs = [...document.querySelectorAll('[data-stop]')];
const detailInput = document.querySelector('#effect-scale');
const detailValue = document.querySelector('#scale-value');
const detailReset = document.querySelector('#scale-reset');
const fullscreenButton = document.querySelector('#fullscreen');

const palettes = {
  jupiter: ['#100e25', '#493e75', '#ac6d83', '#f7a46b', '#ffdf9b'],
  electric: ['#090d20', '#273576', '#5c43bb', '#e5599d', '#f9d5c6'],
  monochrome: ['#080808', '#333333', '#777777', '#c2c2c2', '#ffffff']
};
const visuals = {
  'coral-burn': { src: './assets/coral-burn.mp4?v=1080-clean', name: 'CORAL BURN' },
  'vessel-red': { src: './assets/vessel-red.mp4?v=pingpong', name: 'VESSEL RED' }
};

video.muted = true;
video.playsInline = true;
video.setAttribute('webkit-playsinline', '');

function attemptPlayback() {
  if (!video.paused) return;
  const attempt = video.play();
  if (attempt) attempt.catch(() => { status.textContent = 'TOUCH TO PLAY'; });
}

video.addEventListener('playing', () => { status.textContent = `${visuals[visualSource.value].name} / LOOP`; });
video.addEventListener('loadeddata', attemptPlayback);
video.addEventListener('error', () => { status.textContent = 'VISUAL UNAVAILABLE'; });
video.addEventListener('pause', () => {
  if (!document.hidden && !video.ended) status.textContent = 'TOUCH TO PLAY';
});
viewer.addEventListener('pointerdown', attemptPlayback, { passive: true });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) attemptPlayback();
});

toggle.addEventListener('click', () => {
  panel.hidden = !panel.hidden;
  toggle.setAttribute('aria-expanded', String(!panel.hidden));
});

visualSource.addEventListener('change', () => {
  const selected = visuals[visualSource.value];
  if (!selected) return;
  status.textContent = 'LOADING VISUAL';
  canvas.classList.remove('is-ready');
  video.src = selected.src;
  video.load();
});

paletteSelect.addEventListener('change', () => {
  colourStops.hidden = paletteSelect.value !== 'custom';
  if (palettes[paletteSelect.value]) {
    stopInputs.forEach((input, index) => { input.value = palettes[paletteSelect.value][index]; });
  }
});

function updateDetail() {
  detailValue.value = `${detailInput.value}%`;
  detailInput.setAttribute('aria-valuetext', detailValue.value);
}
detailInput.addEventListener('input', updateDetail);
detailReset.addEventListener('click', () => {
  detailInput.value = '100';
  updateDetail();
});
updateDetail();

fullscreenButton.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await viewer.requestFullscreen();
  } catch {
    // The enclosing OS window may not grant native fullscreen on every browser.
  }
});
document.addEventListener('fullscreenchange', () => {
  const expanded = document.fullscreenElement === viewer;
  const label = expanded ? 'Exit fullscreen' : 'Enter fullscreen';
  fullscreenButton.setAttribute('aria-label', label);
  fullscreenButton.setAttribute('aria-pressed', String(expanded));
  fullscreenButton.title = label;
  panel.hidden = true;
  toggle.setAttribute('aria-expanded', 'false');
});

const gl = canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'low-power' });
if (gl) {
  const vertexSource = `
    attribute vec2 aPosition;
    varying vec2 vUv;
    void main() {
      vUv = (aPosition + 1.0) * 0.5;
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
  `;
  const fragmentSource = `
    precision highp float;
    varying vec2 vUv;
    uniform sampler2D uVideo;
    uniform vec2 uCrop;
    uniform vec2 uTexel;
    uniform vec3 uColours[5];
    uniform float uOriginal;
    uniform float uDetail;
    vec3 grade(float value) {
      if (value < 0.22) return mix(uColours[0], uColours[1], value / 0.22);
      if (value < 0.48) return mix(uColours[1], uColours[2], (value - 0.22) / 0.26);
      if (value < 0.72) return mix(uColours[2], uColours[3], (value - 0.48) / 0.24);
      return mix(uColours[3], uColours[4], clamp((value - 0.72) / 0.28, 0.0, 1.0));
    }
    void main() {
      vec2 uv = (vUv - 0.5) * uCrop + 0.5;
      vec3 source = texture2D(uVideo, uv).rgb;
      if (abs(uDetail - 1.0) > 0.005) {
        // Work on cloud-sized features, not individual compressed video pixels.
        float radius = uDetail < 1.0 ? 28.0 : 12.0;
        vec2 stepUv = uTexel * radius;
        vec3 nearby = source * 4.0;
        nearby += (texture2D(uVideo, uv + vec2(stepUv.x, 0.0)).rgb
                 + texture2D(uVideo, uv - vec2(stepUv.x, 0.0)).rgb
                 + texture2D(uVideo, uv + vec2(0.0, stepUv.y)).rgb
                 + texture2D(uVideo, uv - vec2(0.0, stepUv.y)).rgb) * 2.0;
        nearby += texture2D(uVideo, uv + stepUv).rgb
                + texture2D(uVideo, uv - stepUv).rgb
                + texture2D(uVideo, uv + vec2(stepUv.x, -stepUv.y)).rgb
                + texture2D(uVideo, uv + vec2(-stepUv.x, stepUv.y)).rgb;
        nearby *= 0.0625;
        float strength = uDetail < 1.0 ? (1.0 - uDetail) * 1.8 : (uDetail - 1.0) * 1.35;
        source = uDetail < 1.0
          ? mix(source, nearby, strength)
          : clamp(source + (source - nearby) * strength, 0.0, 1.0);
      }
      float luminance = dot(source, vec3(0.2126, 0.7152, 0.0722));
      gl_FragColor = vec4(mix(grade(luminance), source, uOriginal), 1.0);
    }
  `;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  const vertex = compile(gl.VERTEX_SHADER, vertexSource);
  const fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
  if (vertex && fragment) {
    const program = gl.createProgram();
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.useProgram(program);
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, 'aPosition');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.uniform1i(gl.getUniformLocation(program, 'uVideo'), 0);
      const cropLocation = gl.getUniformLocation(program, 'uCrop');
      const texelLocation = gl.getUniformLocation(program, 'uTexel');
      const coloursLocation = gl.getUniformLocation(program, 'uColours[0]');
      const originalLocation = gl.getUniformLocation(program, 'uOriginal');
      const detailLocation = gl.getUniformLocation(program, 'uDetail');
      let lastTime = -1;
      let lastSource = '';
      let lastWidth = 0;
      let lastHeight = 0;
      let lastSettings = '';

      function hexToRgb(hex) {
        return [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
      }

      function draw() {
        requestAnimationFrame(draw);
        if (document.hidden || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
        const bounds = canvas.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const width = Math.max(1, Math.round(bounds.width * dpr));
        const height = Math.max(1, Math.round(bounds.height * dpr));
        const resized = width !== lastWidth || height !== lastHeight;
        if (resized) {
          canvas.width = width;
          canvas.height = height;
          gl.viewport(0, 0, width, height);
          lastWidth = width;
          lastHeight = height;
        }
        const settings = `${paletteSelect.value}:${detailInput.value}:${stopInputs.map((input) => input.value).join(',')}`;
        if (!resized && lastSource === video.currentSrc && lastTime === video.currentTime && lastSettings === settings) return;
        lastTime = video.currentTime;
        lastSource = video.currentSrc;
        lastSettings = settings;
        const viewportRatio = width / height;
        const videoRatio = video.videoWidth / video.videoHeight;
        gl.uniform2f(cropLocation, viewportRatio > videoRatio ? 1 : viewportRatio / videoRatio,
          viewportRatio > videoRatio ? videoRatio / viewportRatio : 1);
        gl.uniform2f(texelLocation, 1 / video.videoWidth, 1 / video.videoHeight);
        gl.uniform3fv(coloursLocation, new Float32Array(stopInputs.flatMap((input) => hexToRgb(input.value))));
        gl.uniform1f(originalLocation, paletteSelect.value === 'original' ? 1 : 0);
        gl.uniform1f(detailLocation, Number(detailInput.value) / 100);
        try {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
        } catch {
          // Keep the original video visible if this browser refuses video textures.
          canvas.classList.remove('is-ready');
          return;
        }
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        canvas.classList.add('is-ready');
      }
      requestAnimationFrame(draw);
    }
  }
}

attemptPlayback();
