// CRT feedback is synthesised locally, as in the original room. No sound files
// or background track are downloaded with the journal.
export function initUncutSound() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  let context;
  let hum;
  let staticSource;
  let sequence = 0;
  const mix = matchMedia("(hover: none), (pointer: coarse)").matches ? 3 : 1.18;

  async function unlock() {
    context ||= new AudioContextClass();
    if (context.state !== "running") await context.resume();
    return context.state === "running";
  }

  function tone(frequency, endFrequency, duration, gain, type, delay = 0) {
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
    envelope.gain.setValueAtTime(.0001, start);
    envelope.gain.exponentialRampToValueAtTime(gain * mix, start + .008);
    envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(envelope).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + .01);
  }

  function noise(duration, gain, startFrequency, endFrequency, onSource) {
    const length = Math.ceil(context.sampleRate * duration);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) samples[i] = (Math.random() * 2 - 1) * (1 - i / length * .24);
    const source = context.createBufferSource();
    const highpass = context.createBiquadFilter();
    const lowpass = context.createBiquadFilter();
    const envelope = context.createGain();
    const start = context.currentTime;
    source.buffer = buffer;
    highpass.type = "highpass";
    highpass.frequency.value = 420;
    lowpass.type = "lowpass";
    lowpass.frequency.setValueAtTime(startFrequency, start);
    lowpass.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
    envelope.gain.setValueAtTime(.0001, start);
    envelope.gain.exponentialRampToValueAtTime(gain * mix, start + .012);
    envelope.gain.setValueAtTime(gain * mix, start + Math.max(.018, duration - .06));
    envelope.gain.exponentialRampToValueAtTime(.0001, start + duration);
    source.connect(highpass).connect(lowpass).connect(envelope).connect(context.destination);
    source.start(start);
    source.stop(start + duration + .01);
    onSource?.(source);
  }

  function stopStatic() {
    if (!staticSource) return;
    try { staticSource.stop(); } catch {}
    staticSource = null;
  }

  function startHum() {
    if (hum) return;
    const master = context.createGain();
    const fundamental = context.createOscillator();
    const harmonic = context.createOscillator();
    const hiss = context.createBufferSource();
    const hissFilter = context.createBiquadFilter();
    const hissGain = context.createGain();
    const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i += 1) samples[i] = Math.random() * 2 - 1;
    const start = context.currentTime;
    master.gain.setValueAtTime(.0001, start);
    master.gain.exponentialRampToValueAtTime(mix > 2 ? .014 : .009, start + .32);
    fundamental.type = "sine";
    fundamental.frequency.value = 50;
    harmonic.type = "triangle";
    harmonic.frequency.value = 100;
    const harmonicGain = context.createGain();
    harmonicGain.gain.value = .28;
    hiss.buffer = buffer;
    hiss.loop = true;
    hissFilter.type = "bandpass";
    hissFilter.frequency.value = 3400;
    hissFilter.Q.value = .42;
    hissGain.gain.value = .055;
    fundamental.connect(master);
    harmonic.connect(harmonicGain).connect(master);
    hiss.connect(hissFilter).connect(hissGain).connect(master);
    master.connect(context.destination);
    fundamental.start(start);
    harmonic.start(start);
    hiss.start(start);
    hum = { master, sources: [fundamental, harmonic, hiss] };
  }

  function stopHum() {
    if (!hum) return;
    const active = hum;
    hum = null;
    const now = context.currentTime;
    active.master.gain.cancelScheduledValues(now);
    active.master.gain.setValueAtTime(Math.max(.0001, active.master.gain.value), now);
    active.master.gain.exponentialRampToValueAtTime(.0001, now + .24);
    setTimeout(() => {
      active.sources.forEach((source) => { try { source.stop(); } catch {} });
      active.master.disconnect();
    }, 280);
  }

  document.addEventListener("pointerdown", () => { unlock().catch(() => {}); }, { passive: true });
  document.addEventListener("keydown", () => { unlock().catch(() => {}); });
  window.addEventListener("uncut:crt-audio", async (event) => {
    const action = event.detail?.action;
    if (action === "stop") {
      sequence += 1;
      stopStatic();
      if (context) stopHum();
      return;
    }
    const token = sequence;
    try {
      if (!await unlock()) return;
    } catch { return; }
    if (token !== sequence) return;
    if (action === "power") {
      stopStatic();
      tone(72, 48, .16, .05, "sine");
      tone(185, 92, .11, .03, "square", .035);
      startHum();
    } else if (action === "static-start") {
      stopStatic();
      const seconds = Number(event.detail?.duration) / 1000;
      const duration = Number.isFinite(seconds) ? seconds : .92;
      noise(duration, .032, 7800, 7200, (source) => {
        staticSource = source;
        source.addEventListener("ended", () => { if (staticSource === source) staticSource = null; }, { once: true });
      });
    } else if (action === "static-stop") {
      stopStatic();
    } else if (action === "tune") {
      noise(.24, .034, 5200, 1700);
    }
  });
}
