// Efectos de sonido sintetizados con WebAudio (sin archivos de audio).
export class Sfx {
  constructor() {
    this.ctx = null;
  }

  unlock() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!this.ctx) {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.45;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 1.5;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  noise({ dur, freq = 1000, freqEnd, q = 1, type = 'bandpass', gain = 0.5, attack = 0.002, delay = 0 }) {
    const c = this.ctx;
    if (!c || gain <= 0) return;
    const t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  tone({ freq, freqEnd, dur, type = 'sine', gain = 0.3, delay = 0 }) {
    const c = this.ctx;
    if (!c || gain <= 0) return;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  static falloff(dist, range = 70) {
    return Math.max(0.12, 1 - dist / range);
  }

  // dist > 0: disparo de otro jugador, atenuado con la distancia.
  rifle(dist = 0) {
    const v = dist ? Sfx.falloff(dist, 90) * 0.7 : 1;
    this.noise({ dur: 0.09, freq: 1800, freqEnd: 400, q: 0.7, gain: 0.45 * v });
    this.tone({ freq: 150, freqEnd: 60, dur: 0.07, type: 'square', gain: 0.12 * v });
  }
  pistol(dist = 0) {
    const v = dist ? Sfx.falloff(dist, 90) * 0.7 : 1;
    this.tone({ freq: 950, freqEnd: 180, dur: 0.15, type: 'sawtooth', gain: 0.16 * v });
    this.noise({ dur: 0.06, freq: 3000, type: 'highpass', gain: 0.18 * v });
  }
  // Disparo por nombre de sonido; dist > 0 = otro jugador (atenuado).
  shot(name, dist = 0) {
    (this[name] ?? this.rifle).call(this, dist);
  }
  vol(dist, k = 0.7) {
    return dist ? Sfx.falloff(dist, 90) * k : 1;
  }
  smg(dist = 0) {
    const v = this.vol(dist);
    this.noise({ dur: 0.06, freq: 2600, freqEnd: 700, q: 0.8, gain: 0.32 * v });
    this.tone({ freq: 210, freqEnd: 90, dur: 0.05, type: 'square', gain: 0.08 * v });
  }
  shotgun(dist = 0) {
    const v = this.vol(dist, 0.8);
    this.noise({ dur: 0.35, freq: 1400, freqEnd: 120, type: 'lowpass', q: 0.6, gain: 0.85 * v, attack: 0.003 });
    this.tone({ freq: 95, freqEnd: 40, dur: 0.25, gain: 0.45 * v });
    if (!dist) { this.noise({ dur: 0.07, freq: 1800, gain: 0.18, delay: 0.32 }); this.noise({ dur: 0.07, freq: 1300, gain: 0.18, delay: 0.45 }); }
  }
  dmr(dist = 0) {
    const v = this.vol(dist);
    this.noise({ dur: 0.12, freq: 2200, freqEnd: 500, q: 0.9, gain: 0.5 * v });
    this.tone({ freq: 180, freqEnd: 70, dur: 0.09, type: 'square', gain: 0.12 * v });
  }
  sniper(dist = 0) {
    const v = this.vol(dist, 0.9);
    this.noise({ dur: 0.9, freq: 3000, freqEnd: 90, type: 'lowpass', q: 0.4, gain: 0.95 * v, attack: 0.002 });
    this.tone({ freq: 140, freqEnd: 35, dur: 0.6, gain: 0.5 * v });
    this.noise({ dur: 0.5, freq: 600, type: 'bandpass', q: 0.5, gain: 0.15 * v, delay: 0.25 });
  }
  plasma(dist = 0) {
    const v = this.vol(dist);
    this.tone({ freq: 700, freqEnd: 260, dur: 0.11, type: 'sawtooth', gain: 0.12 * v });
    this.tone({ freq: 1400, freqEnd: 600, dur: 0.08, type: 'sine', gain: 0.06 * v });
  }
  needle(dist = 0) {
    const v = this.vol(dist);
    this.tone({ freq: 2400, freqEnd: 3600, dur: 0.07, type: 'triangle', gain: 0.08 * v });
    this.noise({ dur: 0.04, freq: 6000, type: 'highpass', gain: 0.08 * v });
  }
  arc(dist = 0) {
    const v = this.vol(dist, 0.9);
    this.tone({ freq: 120, freqEnd: 600, dur: 0.35, type: 'sawtooth', gain: 0.2 * v });
    this.noise({ dur: 0.4, freq: 900, freqEnd: 200, type: 'lowpass', gain: 0.4 * v });
  }
  zoom() { this.tone({ freq: 1600, dur: 0.03, type: 'square', gain: 0.04 }); }
  shell() { this.noise({ dur: 0.06, freq: 1600, gain: 0.14 }); }
  boxOpen() {
    // Cajita de música: arpegio misterioso.
    [523, 659, 784, 988, 784, 659, 880, 1047].forEach((f, i) => this.tone({ freq: f, dur: 0.22, type: 'triangle', gain: 0.1, delay: i * 0.13 }));
    this.noise({ dur: 0.4, freq: 300, type: 'lowpass', gain: 0.25 });
  }
  boxTick() { this.tone({ freq: 1800, dur: 0.02, type: 'square', gain: 0.025 }); }
  boxReveal() {
    this.tone({ freq: 523, dur: 0.15, type: 'triangle', gain: 0.14 });
    this.tone({ freq: 784, dur: 0.15, type: 'triangle', gain: 0.14, delay: 0.1 });
    this.tone({ freq: 1047, dur: 0.4, type: 'triangle', gain: 0.14, delay: 0.2 });
  }
  mortar(dist = 0) {
    const v = Sfx.falloff(dist, 80);
    this.noise({ dur: 0.25, freq: 500, freqEnd: 150, type: 'lowpass', gain: 0.35 * v });
    this.tone({ freq: 300, freqEnd: 900, dur: 0.6, type: 'sine', gain: 0.05 * v, delay: 0.1 });
  }
  boss() {
    [110, 98, 82, 73].forEach((f, i) => this.tone({ freq: f, dur: 0.6, type: 'sawtooth', gain: 0.16, delay: i * 0.35 }));
    this.noise({ dur: 1.6, freq: 200, type: 'lowpass', gain: 0.3 });
  }
  deny() { this.tone({ freq: 220, freqEnd: 160, dur: 0.18, type: 'square', gain: 0.08 }); }
  overheat() {
    this.noise({ dur: 0.7, freq: 5000, freqEnd: 700, type: 'bandpass', q: 2, gain: 0.25 });
    this.tone({ freq: 320, freqEnd: 110, dur: 0.5, type: 'triangle', gain: 0.15 });
  }
  empty() { this.tone({ freq: 1200, dur: 0.03, type: 'square', gain: 0.07 }); }
  reload(shell = false) {
    if (shell) { this.shell(); return; }
    this.tone({ freq: 480, dur: 0.05, type: 'square', gain: 0.08 });
    this.noise({ dur: 0.08, freq: 2200, gain: 0.15, delay: 0.3 });
    this.tone({ freq: 720, dur: 0.05, type: 'square', gain: 0.09, delay: 1.7 });
  }
  swap() { this.noise({ dur: 0.08, freq: 2500, gain: 0.14 }); }
  throwG() { this.noise({ dur: 0.18, freq: 700, freqEnd: 300, gain: 0.18 }); }
  explosion(dist = 0) {
    const v = Sfx.falloff(dist, 90);
    this.noise({ dur: 1.3, freq: 1000, freqEnd: 60, type: 'lowpass', q: 0.5, gain: 0.9 * v, attack: 0.005 });
    this.tone({ freq: 90, freqEnd: 30, dur: 0.7, gain: 0.6 * v });
  }
  enemyShot(dist = 0) {
    const v = Sfx.falloff(dist);
    this.tone({ freq: 480, freqEnd: 1300, dur: 0.12, type: 'sawtooth', gain: 0.07 * v });
  }
  hit() { this.tone({ freq: 1800, dur: 0.03, type: 'triangle', gain: 0.1 }); }
  kill() {
    this.tone({ freq: 900, dur: 0.05, type: 'triangle', gain: 0.12 });
    this.tone({ freq: 1400, dur: 0.07, type: 'triangle', gain: 0.12, delay: 0.05 });
  }
  shieldPop() { this.tone({ freq: 2400, freqEnd: 500, dur: 0.25, type: 'sawtooth', gain: 0.1 }); }
  shieldHit() {
    this.noise({ dur: 0.12, freq: 4000, q: 4, gain: 0.22 });
    this.tone({ freq: 2200, freqEnd: 1200, dur: 0.1, gain: 0.06 });
  }
  shieldBreak() {
    this.tone({ freq: 650, freqEnd: 140, dur: 0.4, type: 'sawtooth', gain: 0.18 });
    this.noise({ dur: 0.3, freq: 3000, gain: 0.2 });
  }
  shieldRecharge() { this.tone({ freq: 300, freqEnd: 1300, dur: 0.9, gain: 0.1 }); }
  alarm() { this.tone({ freq: 1000, dur: 0.08, type: 'square', gain: 0.05 }); }
  hurt() { this.noise({ dur: 0.22, freq: 320, type: 'lowpass', gain: 0.4 }); }
  land() { this.noise({ dur: 0.12, freq: 260, type: 'lowpass', gain: 0.3 }); }
  melee() {
    this.noise({ dur: 0.12, freq: 450, type: 'lowpass', gain: 0.45 });
    this.tone({ freq: 130, freqEnd: 60, dur: 0.1, gain: 0.3 });
  }
  enemyMelee(dist = 0) { this.noise({ dur: 0.2, freq: 220, type: 'lowpass', gain: 0.5 * Sfx.falloff(dist, 30) }); }
  pickup() {
    this.tone({ freq: 660, dur: 0.06, type: 'triangle', gain: 0.12 });
    this.tone({ freq: 990, dur: 0.08, type: 'triangle', gain: 0.12, delay: 0.06 });
  }
  spawn(dist = 0) { this.tone({ freq: 200, freqEnd: 900, dur: 0.35, type: 'sine', gain: 0.08 * Sfx.falloff(dist, 80) }); }
  wave() {
    this.tone({ freq: 220, dur: 0.35, type: 'triangle', gain: 0.15 });
    this.tone({ freq: 330, dur: 0.35, type: 'triangle', gain: 0.15, delay: 0.15 });
    this.tone({ freq: 440, dur: 0.6, type: 'triangle', gain: 0.15, delay: 0.3 });
  }
  death() { this.tone({ freq: 420, freqEnd: 50, dur: 1.4, type: 'sawtooth', gain: 0.22 }); }
}
