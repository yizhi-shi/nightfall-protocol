/* ------------------------------------------------------------------ */
/*  Procedural audio. No samples, no files — only WebAudio synthesis.  */
/* ------------------------------------------------------------------ */

export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.ambientOn = false;
    this.indoor = false;
    this.rainBus = null;
    this.roomBus = null;
    this.noiseBuffer = null;
    this.lastFootstep = 0;
    this.heartbeat = 0;
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.72;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 16;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.24;
    this.master.connect(comp).connect(this.ctx.destination);
    this.noiseBuffer = this.makeNoise(3);
    this.startAmbience();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  setIndoor(v) {
    this.indoor = !!v;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (this.rainBus) this.rainBus.gain.setTargetAtTime(this.indoor ? 0.24 : 1.0, t, 0.9);
    if (this.roomBus) this.roomBus.gain.setTargetAtTime(this.indoor ? 0.055 : 0.0, t, 1.1);
  }

  doorOpen() {
    if (!this.ctx || !this.noiseBuffer) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 230;
    bp.Q.value = 1.2;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t); src.stop(t + 0.4);
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(78, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.3);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.09, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
    osc.connect(og).connect(this.master);
    osc.start(t); osc.stop(t + 0.36);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(m ? 0 : 0.72, t, 0.06);
    }
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  makeNoise(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      // slightly brown-tinted noise for rain
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      d[i] = (b0 + b1 + b2 + white * 0.1848) * 0.22;
    }
    return buf;
  }

  startAmbience() {
    if (this.ambientOn || !this.ctx) return;
    this.ambientOn = true;
    const t = this.ctx.currentTime;

    // rain bus lets interiors muffle the storm without stopping it
    this.rainBus = this.ctx.createGain();
    this.rainBus.gain.value = this.indoor ? 0.24 : 1.0;
    this.rainBus.connect(this.master);

    // layered rain
    for (let layer = 0; layer < 3; layer++) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;
      src.playbackRate.value = 0.9 + layer * 0.07;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = [260, 900, 2600][layer];
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = [2400, 5000, 9000][layer];
      const g = this.ctx.createGain();
      g.gain.value = [0.16, 0.06, 0.022][layer];
      src.connect(hp).connect(lp).connect(g).connect(this.rainBus);
      src.start(t);
    }

    // low room tone for indoor spaces
    this.roomBus = this.ctx.createGain();
    this.roomBus.gain.value = this.indoor ? 0.055 : 0.0;
    this.roomBus.connect(this.master);
    const roomFilter = this.ctx.createBiquadFilter();
    roomFilter.type = 'lowpass';
    roomFilter.frequency.value = 135;
    const roomGain = this.ctx.createGain();
    roomGain.gain.value = 1;
    const roomOsc = this.ctx.createOscillator();
    roomOsc.type = 'sawtooth';
    roomOsc.frequency.value = 43.6;
    roomOsc.connect(roomFilter).connect(roomGain).connect(this.roomBus);
    roomOsc.start(t);

    // low city drone
    const droneGain = this.ctx.createGain();
    droneGain.gain.value = 0.0;
    droneGain.gain.linearRampToValueAtTime(0.06, t + 6);
    const lp = this.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    lp.Q.value = 2;
    droneGain.connect(lp).connect(this.master);
    [41.2, 55, 82.4].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      o.type = i === 2 ? 'triangle' : 'sawtooth';
      o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.value = [0.4, 0.26, 0.08][i];
      o.connect(g).connect(droneGain);
      o.start(t);
    });

    // slow filter LFO on the rain bed
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = this.ctx.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain).connect(droneGain.gain);
    lfo.start(t);
  }

  noiseBurst(dur, { type = 'lowpass', freq = 900, q = 0.8, gain = 0.4, decay = 0.08, pan = 0 } = {}) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    src.connect(f).connect(g).connect(p).connect(this.master);
    src.start(t);
    src.stop(t + dur);
  }

  tone(freq, dur, { type = 'sine', gain = 0.2, endFreq = null, delay = 0, pan = 0 } = {}) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (endFreq !== null) o.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    o.connect(g).connect(p).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  gunshot() {
    if (!this.ctx || this.muted) return;
    this.noiseBurst(0.16, { type: 'highpass', freq: 480, gain: 0.52, decay: 0.09, pan: (Math.random() - 0.5) * 0.2 });
    this.noiseBurst(0.3, { type: 'lowpass', freq: 340, gain: 0.66, decay: 0.2 });
    this.tone(130, 0.13, { type: 'square', gain: 0.16, endFreq: 42 });
    this.tone(72, 0.24, { type: 'sine', gain: 0.22, endFreq: 35 });
  }

  enemyShot(distance = 10) {
    const v = Math.max(0.08, Math.min(0.4, 14 / (distance + 5)));
    this.noiseBurst(0.1, { type: 'bandpass', freq: 1800, q: 0.9, gain: v, decay: 0.07, pan: (Math.random() - 0.5) * 0.9 });
    this.tone(540, 0.12, { type: 'sawtooth', gain: v * 0.2, endFreq: 120, pan: (Math.random() - 0.5) * 0.9 });
  }

  impact(pan = 0) {
    this.noiseBurst(0.08, { type: 'highpass', freq: 1300, gain: 0.12, decay: 0.05, pan });
    this.tone(2400, 0.03, { type: 'square', gain: 0.025, endFreq: 900, pan });
  }

  reloadStart() {
    if (!this.ctx || this.muted) return;
    this.noiseBurst(0.06, { type: 'bandpass', freq: 700, q: 2, gain: 0.24, decay: 0.05 });
    this.tone(320, 0.05, { type: 'square', gain: 0.04 });
    setTimeout(() => this.noiseBurst(0.08, { type: 'bandpass', freq: 400, q: 2, gain: 0.2, decay: 0.07 }), 220);
    setTimeout(() => {
      this.noiseBurst(0.06, { type: 'bandpass', freq: 900, q: 2, gain: 0.2, decay: 0.05 });
      this.tone(180, 0.05, { type: 'square', gain: 0.04 });
    }, 850);
  }

  reloadEnd() {
    this.noiseBurst(0.07, { type: 'bandpass', freq: 1200, q: 2, gain: 0.26, decay: 0.05 });
    this.tone(440, 0.06, { type: 'square', gain: 0.028 });
  }

  empty() {
    this.noiseBurst(0.03, { type: 'highpass', freq: 2200, gain: 0.12, decay: 0.025 });
    this.tone(900, 0.03, { type: 'square', gain: 0.025 });
  }

  hitmarker(head = false) {
    if (head) {
      this.tone(1480, 0.1, { type: 'triangle', gain: 0.12, endFreq: 980 });
      this.tone(2200, 0.08, { type: 'sine', gain: 0.05 });
    } else {
      this.tone(820, 0.05, { type: 'triangle', gain: 0.06, endFreq: 620 });
    }
  }

  hurt() {
    this.noiseBurst(0.35, { type: 'lowpass', freq: 380, gain: 0.4, decay: 0.3 });
    this.tone(64, 0.32, { type: 'sine', gain: 0.24, endFreq: 38 });
  }

  footstep() {
    this.noiseBurst(0.08, { type: 'lowpass', freq: 260, gain: 0.08, decay: 0.06, pan: (Math.random() - 0.5) * 0.2 });
  }

  pickup() {
    this.tone(660, 0.08, { type: 'triangle', gain: 0.08 });
    this.tone(990, 0.12, { type: 'triangle', gain: 0.1, delay: 0.07 });
  }

  uiClick() {
    this.tone(520, 0.04, { type: 'square', gain: 0.04 });
  }

  radio() {
    this.noiseBurst(0.08, { type: 'bandpass', freq: 1500, q: 1.2, gain: 0.05, decay: 0.06 });
    this.tone(1150, 0.04, { type: 'square', gain: 0.022 });
  }

  relayStart() {
    this.tone(120, 0.6, { type: 'sawtooth', gain: 0.06, endFreq: 240 });
    this.noiseBurst(0.6, { type: 'bandpass', freq: 700, q: 1.5, gain: 0.08, decay: 0.55 });
  }

  relayComplete() {
    [330, 440, 554, 660].forEach((f, i) => this.tone(f, 0.8, { type: 'triangle', gain: 0.07, delay: i * 0.08 }));
    this.noiseBurst(0.4, { type: 'highpass', freq: 900, gain: 0.08, decay: 0.35 });
  }

  gateOpen() {
    this.tone(72, 1.2, { type: 'sawtooth', gain: 0.12, endFreq: 110 });
    this.tone(900, 0.6, { type: 'square', gain: 0.04, endFreq: 1400 });
    this.noiseBurst(1.1, { type: 'lowpass', freq: 900, gain: 0.16, decay: 1 });
  }

  thunder(distance = 1) {
    if (!this.ctx || this.muted) return;
    const d = 0.6 + distance * 1.6;
    setTimeout(() => {
      this.noiseBurst(2.8, { type: 'lowpass', freq: 170, q: 0.7, gain: 0.36, decay: 2.4 });
      this.noiseBurst(1.4, { type: 'bandpass', freq: 420, q: 0.7, gain: 0.12, decay: 1.1 });
    }, d * 1000);
  }

  enemyDown() {
    this.noiseBurst(0.5, { type: 'lowpass', freq: 500, gain: 0.25, decay: 0.45 });
    this.tone(220, 0.6, { type: 'sawtooth', gain: 0.06, endFreq: 58 });
  }

  death() {
    [220, 174, 130].forEach((f, i) => this.tone(f, 0.7, { type: 'sine', gain: 0.12, delay: i * 0.18, endFreq: f * 0.6 }));
  }

  victory() {
    [261, 329, 392, 523, 659].forEach((f, i) => this.tone(f, 1.2, { type: 'triangle', gain: 0.09, delay: i * 0.13 }));
    this.noiseBurst(1.8, { type: 'highpass', freq: 1200, gain: 0.05, decay: 1.6 });
  }

  heartbeatSound(intensity = 0.5) {
    this.tone(52, 0.16, { type: 'sine', gain: 0.08 + intensity * 0.12, endFreq: 34 });
    setTimeout(() => this.tone(48, 0.14, { type: 'sine', gain: 0.06 + intensity * 0.09, endFreq: 32 }), 180);
  }
}
