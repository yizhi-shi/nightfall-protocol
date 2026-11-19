/* ------------------------------------------------------------------ */
/*  Procedural adaptive score. No samples, only WebAudio synthesis.    */
/* ------------------------------------------------------------------ */

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class MusicSystem {
  constructor(audio) {
    this.audio = audio;
    this.ctx = null;
    this.bus = null;
    this.timer = null;
    this.config = null;
    this.step = 0;
    this.nextTime = 0;
    this.intensity = 0;
    this.targetIntensity = 0.2;
    this.started = false;
    this.oscs = [];
    this.layers = {};
  }

  start(config = {}) {
    this.stop();
    this.ctx = this.audio && this.audio.ctx;
    if (!this.ctx) return;
    this.config = {
      bpm: 60, root: 36, scale: [0, 3, 5, 7, 10], padWave: 'sawtooth',
      bassEvery: 8, arpEvery: 2, percEvery: 4, padCutoff: 620,
      padGain: 0.13, bassGain: 0.075, arpGain: 0.045, percGain: 0.03,
      percFreq: 220, arpOctave: 24, ...config,
    };
    const c = this.config;
    const ctx = this.ctx;
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.0001;
    this.bus.gain.setTargetAtTime(0.5, ctx.currentTime + 0.1, 1.2);
    this.bus.connect(this.audio.master);

    this.layers.pad = ctx.createGain();
    this.layers.pad.gain.value = c.padGain;
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = c.padCutoff;
    padFilter.Q.value = 0.8;
    this.layers.pad.connect(padFilter).connect(this.bus);

    this.layers.bass = ctx.createGain();
    this.layers.bass.gain.value = c.bassGain;
    this.layers.bass.connect(this.bus);

    this.layers.arp = ctx.createGain();
    this.layers.arp.gain.value = c.arpGain;
    const delay = ctx.createDelay(0.35);
    delay.delayTime.value = 60 / c.bpm * 0.5;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.18;
    const wet = ctx.createGain();
    wet.gain.value = 0.25;
    this.layers.arp.connect(this.bus);
    this.layers.arp.connect(delay).connect(feedback).connect(delay);
    delay.connect(wet).connect(this.bus);

    this.layers.perc = ctx.createGain();
    this.layers.perc.gain.value = c.percGain;
    this.layers.perc.connect(this.bus);

    // continuous pad voices
    this.padVoices = [];
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator();
      osc.type = c.padWave;
      osc.frequency.value = midi(c.root + (i === 0 ? 0 : i === 1 ? 7 : 12)) * 0.5;
      const g = ctx.createGain();
      g.gain.value = i === 0 ? 0.5 : 0.26;
      osc.connect(g).connect(this.layers.pad);
      osc.start();
      this.padVoices.push(osc);
      this.oscs.push(osc);
    }

    this.step = 0;
    this.nextTime = ctx.currentTime + 0.12;
    this.started = true;
    this.timer = setInterval(() => this.schedule(), 70);
    this.schedule();
  }

  schedule() {
    if (!this.ctx || !this.started) return;
    const c = this.config;
    const stepDur = (60 / c.bpm) / 2;
    const horizon = this.ctx.currentTime + 0.3;
    let guard = 0;
    while (this.nextTime < horizon && guard++ < 32) {
      this.scheduleStep(this.step, this.nextTime);
      this.step = (this.step + 1) % 64;
      this.nextTime += stepDur;
    }
  }

  scheduleStep(step, time) {
    const c = this.config;
    const bar = Math.floor(step / 8) % 4;
    if (step % 8 === 0) {
      // slow four-chord progression
      const chords = [[0, 7, 12], [-2, 5, 10], [-5, 3, 8], [0, 7, 15]];
      const chord = chords[bar];
      this.padVoices.forEach((osc, i) => {
        const f = midi(c.root + chord[i]) * 0.5;
        osc.frequency.setTargetAtTime(f, time, 0.45);
      });
    }
    if (step % c.bassEvery === 0) {
      const note = c.root + (step % 16 === 0 ? 0 : c.scale[step % c.scale.length]);
      this.note(midi(note), 0.7, 0.08, 'sine', 260, this.layers.bass, time);
    }
    const combat = this.targetIntensity;
    if (step % c.arpEvery === 0 && (step % 2 === 0 || combat > 0.45)) {
      const idx = (step * 3 + bar) % c.scale.length;
      const note = c.root + c.arpOctave + c.scale[idx] + (step % 8 === 0 ? 12 : 0);
      this.note(midi(note), 0.16, 0.035 + combat * 0.02, 'triangle', 1800, this.layers.arp, time);
    }
    if (step % c.percEvery === 0) {
      this.perc(time, 0.35 + combat * 0.55);
    }
    if (step % 16 === 0) {
      // low impact / machinery hit
      this.perc(time, 0.9, c.percFreq * 0.55);
    }
  }

  note(freq, duration, gain, type, cutoff, destination, time) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), time + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    osc.connect(filter).connect(g).connect(destination);
    osc.start(time); osc.stop(time + duration + 0.03);
  }

  perc(time, strength = 1, freq = null) {
    if (!this.ctx || !this.audio.noiseBuffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.audio.noiseBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq || this.config.percFreq;
    bp.Q.value = 1.4;
    const g = this.ctx.createGain();
    const amp = 0.055 * strength;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, amp), time + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.12);
    src.connect(bp).connect(g).connect(this.layers.perc);
    src.start(time, Math.random() * 1.4, 0.16);
  }

  setCombat(active) {
    if (!this.ctx) return;
    this.targetIntensity = active ? 0.85 : 0.2;
    const t = this.ctx.currentTime;
    const c = this.config;
    if (!c) return;
    this.layers.arp.gain.setTargetAtTime(c.arpGain * (active ? 2.2 : 0.7), t, 0.6);
    this.layers.perc.gain.setTargetAtTime(c.percGain * (active ? 2.6 : 0.65), t, 0.6);
    this.layers.bass.gain.setTargetAtTime(c.bassGain * (active ? 1.45 : 0.8), t, 0.7);
  }

  sting(kind = 'relay') {
    if (!this.ctx || !this.bus) return;
    const t = this.ctx.currentTime + 0.02;
    const root = this.config ? this.config.root : 36;
    const sets = {
      relay: [root + 12, root + 19, root + 24],
      extract: [root + 7, root + 12, root + 19],
      win: [root + 12, root + 16, root + 19, root + 24],
      lose: [root + 1, root - 5, root - 12],
    };
    const notes = sets[kind] || sets.relay;
    notes.forEach((n, i) => {
      this.note(midi(n), kind === 'win' ? 1.6 : 0.7, 0.075, 'triangle', 2600, this.bus, t + i * 0.12);
    });
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.started = false;
    if (this.bus && this.ctx) {
      this.bus.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.2);
    }
    for (const o of this.oscs) {
      try { o.stop(this.ctx.currentTime + 0.4); } catch (e) { /* already stopped */ }
    }
    this.oscs = [];
    this.padVoices = [];
    this.layers = {};
  }
}
