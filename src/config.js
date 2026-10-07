// Tuning central del juego. Unidades: metros, segundos, puntos de daño.
export const CFG = {
  arena: { half: 58 },

  player: {
    height: 1.7, crouchHeight: 1.1, radius: 0.4, step: 0.5,
    walk: 6.2, sprint: 9.4, crouch: 3.2, jump: 7.4, gravity: 22,
    groundAccel: 14, airControl: 2.5, sensitivity: 0.0022,
    maxHealth: 100, maxShield: 100,
    shieldDelay: 4.5, shieldRate: 45, healthRate: 6,
  },

  rifle: {
    name: 'AR-9 CARBINE', mag: 32, reserve: 192, maxReserve: 384,
    interval: 0.09, damage: 8, spread: 0.018, sprayGrow: 0.005, sprayMax: 0.055,
    range: 150, reload: 2.1, headMult: 1.5, shieldMult: 1,
  },

  pistol: {
    name: 'ION SIDEARM', interval: 0.18, damage: 16, spread: 0.004, range: 120,
    heatPerShot: 0.11, cool: 0.45, overheat: 2.4, headMult: 3, shieldMult: 2,
  },

  swapTime: 0.45,
  grenade: { max: 4, start: 2, speed: 17, fuse: 2.0, radius: 7.5, damage: 140 },
  melee: { range: 2.6, damage: 70, cooldown: 0.75, lunge: 4 },

  enemies: {
    skitter: {
      label: 'Skitter', hp: 40, shield: 0, speed: 4.4, scale: 0.85,
      body: 0xc77a2c, glow: 0x7cf0ff, interval: [1.1, 1.9], burst: 1, gap: 0,
      projSpeed: 26, dmg: 7, spread: 0.05, range: [7, 16], score: 50, drop: 0.35,
    },
    warden: {
      label: 'Warden', hp: 70, shield: 80, speed: 3.1, scale: 1.25,
      body: 0x4b3a8f, glow: 0xff5ad1, interval: [1.6, 2.6], burst: 3, gap: 0.14,
      projSpeed: 34, dmg: 9, spread: 0.035, range: [12, 24], score: 150, drop: 0.6,
    },
    ravager: {
      label: 'Ravager', hp: 150, shield: 0, speed: 5.2, scale: 1.35,
      body: 0x6b2a22, glow: 0xff5a2a, interval: [0.9, 1.3], dmg: 40,
      range: [0, 1.9], melee: true, score: 200, drop: 0.5,
    },
  },

  waves: { intermission: 4, spawnGap: 0.7, maxAlive: 12 },
};

export function waveComposition(n) {
  return {
    skitter: Math.min(14, 3 + n * 2),
    warden: Math.min(6, Math.floor(n / 2)),
    ravager: n >= 3 ? Math.min(4, Math.floor((n - 1) / 2)) : 0,
  };
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const rand = (a, b) => a + Math.random() * (b - a);
