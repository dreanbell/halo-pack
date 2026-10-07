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

  rifle() {
    this.noise({ dur: 0.09, freq: 1800, freqEnd: 400, q: 0.7, gain: 0.45 });
    this.tone({ freq: 150, freqEnd: 60, dur: 0.07, type: 'square', gain: 0.12 });
  }
  pistol() {
    this.tone({ freq: 950, freqEnd: 180, dur: 0.15, type: 'sawtooth', gain: 0.16 });
    this.noise({ dur: 0.06, freq: 3000, type: 'highpass', gain: 0.18 });
  }
  overheat() {
    this.noise({ dur: 0.7, freq: 5000, freqEnd: 700, type: 'bandpass', q: 2, gain: 0.25 });
    this.tone({ freq: 320, freqEnd: 110, dur: 0.5, type: 'triangle', gain: 0.15 });
  }
  empty() { this.tone({ freq: 1200, dur: 0.03, type: 'square', gain: 0.07 }); }
  reload() {
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
