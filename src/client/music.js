import { S, onSettings } from './settings.js';

// Música dinámica generada con WebAudio (sin archivos): capas de pad, arpegio, bajo y batería que se mezclan según
// el momento — menú (ambiente), pausa entre oleadas (calma), combate y jefe (más rápido y pesado). Un programador
// con margen de 0,3 s pone las notas por adelantado (como un secuenciador): casi no gasta CPU y no depende de los FPS.
const LOOK = 0.3, TICK = 90; // s de margen · ms entre pasadas del programador
const MOODS = {
  //        bpm  pad   arp   bass  drums  progresión (raíz en semitonos sobre La 2 y tipo de acorde)
  menu: { bpm: 84, mix: [0.55, 0.22, 0, 0], prog: [[0, 'm'], [-4, 'M'], [3, 'M'], [-2, 'M']] },
  calm: { bpm: 96, mix: [0.45, 0.3, 0.25, 0.12], prog: [[0, 'm'], [-4, 'M'], [3, 'M'], [-2, 'M']] },
  combat: { bpm: 122, mix: [0.3, 0.32, 0.55, 0.6], prog: [[0, 'm'], [-4, 'M'], [3, 'M'], [-2, 'M']] },
  boss: { bpm: 134, mix: [0.35, 0.38, 0.7, 0.75], prog: [[5, 'm'], [1, 'M'], [-2, 'm'], [4, 'M']] },
  silent: { bpm: 96, mix: [0, 0, 0, 0], prog: [[0, 'm']] },
};
const CHORD = { m: [0, 3, 7], M: [0, 4, 7] };
const A2 = 110;
const hz = (semi) => A2 * 2 ** (semi / 12);

export class Music {
  constructor(sfx) {
    this.sfx = sfx;
    this.mood = 'menu';
    this.duck = 1;
    this.step = 0;
    this.next = 0;
    this.timer = null;
    onSettings(() => this.level());
  }

  // Se arranca al primer toque/clic (el navegador no deja sonar antes).
  start() {
    const ac = this.sfx.ctx;
    if (!ac || this.bus) { this.run(); return; }
    this.bus = ac.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(this.sfx.master);
    // Una ganancia por capa (para mezclar entre estados con fundido).
    this.layers = ['pad', 'arp', 'bass', 'drums'].map(() => { const g = ac.createGain(); g.gain.value = 0; g.connect(this.bus); return g; });
    // Pad: filtro paso bajo común que «respira».
    this.padFilter = ac.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 900;
    this.padFilter.connect(this.layers[0]);
    this.next = ac.currentTime + 0.1;
    this.level();
    this.setMood(this.mood, true);
    this.run();
  }

  run() {
    if (this.timer || !this.bus) return;
    this.timer = setInterval(() => this.schedule(), TICK);
  }

  stop() { clearInterval(this.timer); this.timer = null; }

  level() {
    if (!this.bus) return;
    const ac = this.sfx.ctx;
    this.bus.gain.setTargetAtTime(S.volMusic * 0.5 * this.duck, ac.currentTime, 0.4);
  }

  // Pausa / pantallas: la música baja sin pararse.
  setDuck(k) {
    if (this.duck === k) return;
    this.duck = k;
    this.level();
  }

  setMood(name, now = false) {
    if (!MOODS[name] || (name === this.mood && !now)) return;
    this.mood = name;
    if (!this.bus) return;
    const ac = this.sfx.ctx, mix = MOODS[name].mix;
    this.layers.forEach((g, i) => g.gain.setTargetAtTime(mix[i], ac.currentTime, now ? 0.05 : 1.2));
  }

  schedule() {
    const ac = this.sfx.ctx;
    if (!ac || ac.state !== 'running' || document.hidden || S.volMusic <= 0) { if (ac) this.next = Math.max(this.next, ac.currentTime + 0.05); return; }
    const m = MOODS[this.mood];
    const sixteenth = 60 / m.bpm / 4;
    if (this.next < ac.currentTime - 0.5) this.next = ac.currentTime + 0.05; // tras una pausa larga, sin ráfaga
    while (this.next < ac.currentTime + LOOK) {
      this.play(this.step, this.next, sixteenth, m);
      this.next += sixteenth;
      this.step = (this.step + 1) % 256;
    }
  }

  // Un paso de semicorchea: 16 por compás, un acorde por compás.
  play(step, t, dur, m) {
    const mix = MOODS[this.mood].mix;
    const bar = Math.floor(step / 16), s = step % 16;
    const [root, kind] = m.prog[bar % m.prog.length], notes = CHORD[kind].map((n) => n + root);
    if (s === 0 && mix[0] > 0.01) this.pad(t, dur * 16, notes);
    if (mix[1] > 0.01 && (this.mood !== 'menu' || s % 2 === 0)) {
      const pat = [0, 1, 2, 1, 2, 0, 1, 2];
      this.arp(t, dur * 0.9, notes[pat[s % 8]] + 24 + (s >= 8 && this.mood === 'boss' ? 12 : 0));
    }
    if (mix[2] > 0.01 && s % 2 === 0) this.bass(t, dur * 1.8, root - 12 + (s === 6 || s === 14 ? 7 : 0));
    if (mix[3] > 0.01) {
      if (s % 4 === 0 || (this.mood === 'boss' && s === 10)) this.kick(t);
      if (s === 4 || s === 12) this.snare(t);
      if (s % 2 === 0 || this.mood === 'boss') this.hat(t, s % 4 === 2 ? 0.5 : 0.28);
    }
  }

  env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }

  osc(type, freq, t, end, out, detune = 0) {
    const o = this.sfx.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    o.connect(out);
    o.start(t);
    o.stop(end);
    return o;
  }

  pad(t, len, notes) {
    const ac = this.sfx.ctx, g = ac.createGain();
    g.connect(this.padFilter);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + len * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len * 1.05);
    for (const n of notes) for (const d of [-7, 7]) this.osc('sawtooth', hz(n + 12), t, t + len * 1.1, g, d);
    this.padFilter.frequency.setTargetAtTime(this.mood === 'boss' ? 1400 : 700 + Math.random() * 500, t, len * 0.4);
  }

  arp(t, len, n) {
    const ac = this.sfx.ctx, g = ac.createGain();
    g.connect(this.layers[1]);
    this.env(g, t, 0.005, 0.07, len);
    this.osc(this.mood === 'menu' ? 'sine' : 'triangle', hz(n), t, t + len + 0.05, g);
  }

  bass(t, len, n) {
    const ac = this.sfx.ctx, g = ac.createGain(), f = ac.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = this.mood === 'boss' ? 700 : 420;
    f.connect(this.layers[2]);
    g.connect(f);
    this.env(g, t, 0.01, 0.16, len);
    this.osc('sawtooth', hz(n), t, t + len + 0.05, g);
  }

  kick(t) {
    const ac = this.sfx.ctx, g = ac.createGain(), o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    o.connect(g);
    g.connect(this.layers[3]);
    this.env(g, t, 0.003, 0.5, 0.28);
    o.start(t);
    o.stop(t + 0.32);
  }

  noiseHit(t, type, freq, peak, dec) {
    const ac = this.sfx.ctx, src = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = this.sfx.noiseBuf;
    f.type = type;
    f.frequency.value = freq;
    src.connect(f).connect(g).connect(this.layers[3]);
    this.env(g, t, 0.002, peak, dec);
    src.start(t, Math.random() * 1.2);
    src.stop(t + dec + 0.05);
  }

  snare(t) { this.noiseHit(t, 'bandpass', 1800, 0.28, 0.16); this.noiseHit(t, 'lowpass', 400, 0.18, 0.08); }
  hat(t, k) { this.noiseHit(t, 'highpass', 7000, 0.08 * k, 0.04); }
}
