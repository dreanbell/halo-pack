// Definición de los mapas: entorno, luz y distribución. Las piezas las da el kit de world.js.
// Diseño original inspirado en mundos-anillo y ruinas de una civilización antigua.
const PI = Math.PI;

// Torre monumental lejana (decorado, sin colisión).
function farTower(k, x, z, h, s = 14) {
  const y = k.heightAt(x, z) - 2;
  k.block(x, y, z, s, h, s, { mat: 'struct', cham: s * 0.3, top: 0.35, collide: false });
  k.block(x, y, z, s * 1.6, h * 0.18, s * 1.6, { mat: 'dark', cham: s * 0.5, top: 0.7, collide: false });
  k.strip(x, y + h * 0.5, z, 0.3, h * 0.7, s * 0.72);
  k.strip(x, y + h * 0.5, z, s * 0.72, h * 0.7, 0.3);
  const beam = new k.THREE.Mesh(new k.THREE.CylinderGeometry(0.8, 0.8, 900, 8, 1, true),
    new k.THREE.MeshBasicMaterial({ color: 0x8fe8ff, transparent: true, opacity: 0.35, blending: k.THREE.AdditiveBlending, depthWrite: false, fog: false }));
  beam.position.set(x, y + h + 450, z);
  k.add(beam);
}

// Contenedor de carga (cobertura): cuerpo, nervios verticales y franja de neón opcional.
const CONTAINER_MATS = new Map();
function container(k, x, z, rotY, y = 0, color = 0x7a2a22, neon = null) {
  if (!CONTAINER_MATS.has(color)) CONTAINER_MATS.set(color, new k.THREE.MeshStandardMaterial({ color, metalness: 0.55, roughness: 0.55 }));
  const ax = Math.abs(Math.sin(rotY)) > 0.5;
  const w = ax ? 2.45 : 6.1, d = ax ? 6.1 : 2.45;
  k.block(x, y, z, w, 2.6, d, { mat: CONTAINER_MATS.get(color), cham: 0.1 });
  for (let i = -2; i <= 2; i++) {
    const o = i * 1.2;
    k.block(x + (ax ? 0 : o), y, z + (ax ? o : 0), ax ? 2.55 : 0.12, 2.62, ax ? 0.12 : 2.55, { mat: 'dark', cham: 0.02, collide: false, shadow: false });
  }
  if (neon !== null) k.strip(x, y + 2.3, z, ax ? 2.5 : 6.15, 0.08, ax ? 6.15 : 2.5, neon);
}

export const MAP_DEFS = {
  valle: {
    half: 58, seed: 1337,
    spawn: { x: 0, z: 30 },
    boxes: [[0, 2.4, -2.2, 0], [-44, 0, -6, PI / 2]],
    menuCam: [0, 9, 34],
    env: { top: 0x3a74c0, bottom: 0xdfeaf2, ground: 0x4a5840, sun: [40, 90, 25] },
    exposure: 1,
    build(k) {
      k.materials({ metal: '#a7b0ba', dark: '#5d6672', glow: 0x5fe1ff, rock: '#7d7b70', crate: '#56604a' });
      k.sky({ top: 0x2a64ad, mid: 0xcfe3f2, bottom: 0x9fb5a0, sun: [40, 90, 25], sunColor: 0xfff1d6, fog: [0xb4cbe0, 90, 720] });
      k.lights({ hemi: [0xd6eaff, 0x4a5a3a, 0.65], sun: [0xfff1d6, 2.5] });
      k.ring({ pos: [420, 880, -120], rot: [0, 0, PI / 2], radius: 1000, width: 110 });
      k.clouds({ count: 22 });
      k.ground({ kind: 'grass', tile: 6 });
      k.terrain({ start: 4, rise: 70, base: 6, amp: 80, freq: 0.006, far: 0.06, colors: ['#4f6a3c', '#5b6c42', '#85857c', '#f2f5f8'], levels: [0.22, 0.55, 0.86], steep: '#6e6a5e' });
      k.keep(0, 30, 7);
      k.perimeter({ style: 'forerunner', h: 7 });

      // Plataforma central con escaleras, monolitos y emblema.
      k.platform(0, 0, 14, 14, 2.4, { stairs: ['n', 's'] });
      for (const [x, z] of [[-5.5, -5.5], [5.5, -5.5], [-5.5, 5.5], [5.5, 5.5]]) k.pillar(x, z, 4.2, 0.9, { y: 2.4 });
      k.holo(0, 9.5, 0, 2.2);
      k.light(0, 5, 0, 0x5fe1ff, 40, 22);

      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.bunker(sx * 34, sz * 34, sx, sz);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * PI * 2;
        k.pillar(Math.cos(a) * 22, Math.sin(a) * 22, 8, 2);
      }
      k.arch(0, -42, 9, 6, 'x');
      k.arch(42, 4, 9, 6, 'z');
      k.wall(-16, -30, 6, 1, 1.5);
      k.wall(18, 30, 1, 6, 1.5);
      k.wall(-30, 14, 1, 5, 1.5);

      k.scatter('crate', 20, { rmin: 12, rmax: 54, size: [1.4, 2.4] });
      k.scatter('rock', 10, { rmin: 8, rmax: 52, size: [1.2, 2.6] });

      k.trees({ count: 160, rmin: 8, rmax: 220, crown: 0x2f4a2c });
      farTower(k, -260, -420, 160);
      farTower(k, 380, 160, 110, 10);
      k.grass({ count: 2800, color: 0x8aa860 });
      k.particles({ kind: 'motes', count: 300, color: 0xfff2b0, size: 0.07, opacity: 0.7, top: 14 });
    },
  },

  glaciar: {
    half: 54, seed: 2024,
    spawn: { x: 0, z: 38 },
    boxes: [[22, 2.7, 0, PI / 2], [-30, 0, -24, 0]],
    menuCam: [0, 11, 44],
    env: { top: 0x4a5a90, bottom: 0xf0c8b8, ground: 0xdfe8f2, sun: [-60, 22, -40], sunColor: 0xffd0a0, sunPower: 20 },
    exposure: 0.95,
    build(k) {
      k.materials({ metal: '#bcc6d2', dark: '#55627a', glow: 0x7fd8ff, rock: '#8a8f99', rockSnow: true, crate: '#5a6470' });
      k.sky({ top: 0x2b3d73, mid: 0xe9b9a8, bottom: 0xc9d3e6, sun: [-60, 22, -40], sunColor: 0xffc89a, haze: 1.8, stars: 0.25, fog: [0xc9c9dc, 60, 560] });
      k.lights({ hemi: [0xbfd0ff, 0xe8eef8, 0.75], sun: [0xffd1b0, 2.1] });
      k.ring({ pos: [-300, 760, 520], rot: [0.35, 0.4, PI / 2], radius: 1000, width: 100, tint: 0xe6d8f0, seed: 9 });
      k.clouds({ count: 16, color: 0xffd8c8, opacity: 0.6, height: [90, 200] });
      k.ground({ kind: 'snow', tile: 7, variation: 0.12 });
      k.terrain({ start: 12, rise: 60, base: 18, amp: 120, freq: 0.007, far: 0.08, colors: ['#eef3f8', '#d4dce6', '#7a8392', '#ffffff'], levels: [0.3, 0.55, 0.75], steep: '#7d8696', tex: 'snow' });
      k.keep(0, 38, 7);
      k.perimeter({ style: 'forerunner', h: 7.5 });

      // Aguja central rodeada de muretes.
      k.pillar(0, 0, 16, 4.5, { mat: 'struct' });
      k.holo(0, 21, 0, 3.2);
      k.light(0, 4, 0, 0x7fd8ff, 45, 26);
      k.wall(0, -8.5, 6, 1, 1.4); k.wall(0, 8.5, 6, 1, 1.4);
      k.wall(-8.5, 0, 1, 6, 1.4); k.wall(8.5, 0, 1, 6, 1.4);

      // Terrazas laterales.
      for (const sx of [-1, 1]) {
        k.platform(sx * 22, 0, 9, 18, 2.7, { stairs: ['w', 'e'], stairW: 3.5 });
        k.pillar(sx * 22, -7.6, 3.5, 1.1, { y: 2.7 });
        k.pillar(sx * 22, 7.6, 3.5, 1.1, { y: 2.7 });
      }
      k.arch(0, -32, 10, 6.5, 'x');
      k.arch(0, 28, 10, 6.5, 'x');
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) k.bunker(sx * 36, sz * 34, sx, sz);

      k.scatter('crystal', 14, { rmin: 10, rmax: 50, size: [1.2, 2.0] });
      k.scatter('rock', 8, { rmin: 12, rmax: 50, size: [1.4, 2.6] });
      k.scatter('crate', 8, { rmin: 14, rmax: 48 });

      k.trees({ count: 170, rmin: 10, rmax: 160, crown: 0x2c4434, snow: true, maxSlope: 1.4 });
      farTower(k, 320, -380, 190, 16);
      k.particles({ kind: 'snow', count: 2600, color: 0xffffff, size: 0.13, opacity: 0.9, top: 26 });
    },
  },

  canon: {
    half: 60, seed: 77,
    spawn: { x: 0, z: 36 },
    boxes: [[-30, 0, 30, 0], [30, 0, -24, PI / 2]],
    menuCam: [0, 10, 44],
    env: { top: 0x5b8ac0, bottom: 0xf2d6a8, ground: 0xb08050, sun: [30, 70, -50], sunColor: 0xfff0d0 },
    exposure: 1,
    build(k) {
      k.materials({ metal: '#b5ab96', dark: '#5e5a55', glow: 0x6ff0ff, rock: '#a8754a', hull: '#5a616c', alien: '#4a2e6a', alienGlow: 0xd36bff, crate: '#6a5a40' });
      k.sky({ top: 0x2f68c0, mid: 0xf2d3a0, bottom: 0xd8b080, sun: [30, 70, -50], sunColor: 0xfff0d0, haze: 1.3, fog: [0xe2c49a, 80, 660] });
      k.lights({ hemi: [0xffe8c8, 0x8a6040, 0.6], sun: [0xfff0d8, 2.8] });
      k.planet({ pos: [-700, 300, -900], radius: 150, colors: ['#c8b8a0', '#a89880', '#e0d0b8', '#8a7a68'], atmo: 0xffe0c0, bands: 14 });
      k.ring({ pos: [500, 820, 300], rot: [0.2, -0.5, PI / 2], radius: 1000, width: 90, tint: 0xf0e0c8, seed: 11 });
      k.clouds({ count: 10, color: 0xfff0e0, opacity: 0.5, height: [200, 320] });
      k.ground({ kind: 'sand', tile: 7, variation: 0.2 });
      k.terrain({ start: 1, rise: 12, base: 36, amp: 34, freq: 0.01, far: 0.03, terrace: 7, colors: ['#b07848', '#c08a58', '#93593a', '#d8b080'], levels: [0.3, 0.6, 0.9], steep: '#8a5236', tex: '#d8c8b0' });
      k.keep(0, 36, 7);
      k.perimeter({ style: 'rock', h: 10 });

      // Crucero estrellado partido en tramos (con huecos para cruzar).
      const segs = [[-24, -12, 3.8], [-8, -2, 4.2], [3, 10, 3.6], [14, 23, 3.2]];
      for (const [a, b, h] of segs) {
        const c = (a + b) / 2, len = b - a;
        k.block(c, 0, 0, len, h, 7, { mat: 'hull', cham: 2.2, top: 0.82 });
        k.block(c, h, 0, len - 1, 0.8, 3.2, { mat: 'hull', cham: 1.2, top: 0.7 });
        // Costillas del casco.
        for (let x = a + 1.2; x < b - 0.8; x += 2.4) k.block(x, 0, 0, 0.35, h + 0.15, 7.3, { mat: 'dark', cham: 0.15, top: 0.82, collide: false });
        k.strip(c, h * 0.55, 3.52, len - 1.5, 0.12, 0.05, k.M.glowAlien);
        k.strip(c, h * 0.55, -3.52, len - 1.5, 0.12, 0.05, k.M.glowAlien);
      }
      k.stairs(6.5, 3.5, 's', 3.5, 3.6, 'hull');
      // Proa hundida y aleta.
      k.block(-28, 0, 1, 5, 2.6, 5, { mat: 'hull', cham: 2, top: 0.4 });
      const fin = k.block(17, 3.2, 0, 1, 4, 5, { mat: 'hull', cham: 0.3, top: 0.3, collide: false });
      fin.rotation.z = -0.4;
      k.light(0, 6, 6, 0xd36bff, 40, 24);

      // Mesetas con escaleras talladas.
      k.block(-36, 0, -30, 14, 5, 12, { mat: 'rock', cham: 3 });
      k.stairs(-29, -30, 'e', 4, 5, 'rock');
      k.block(36, 0, 28, 12, 5, 14, { mat: 'rock', cham: 3 });
      k.stairs(30, 28, 'w', 4, 5, 'rock');
      k.pillar(-38, -32, 4, 1.4, { y: 5 });
      k.pillar(38, 30, 4, 1.4, { y: 5 });

      for (const [x, z, h] of [[-14, 24, 12], [20, -26, 14], [-46, 10, 10], [46, -8, 11], [-6, -46, 13]]) k.spire(x, z, h, 1.2);
      k.wall(-18, -14, 1, 6, 1.5);
      k.wall(24, 14, 6, 1, 1.5);

      k.scatter('rock', 16, { rmin: 10, rmax: 56, size: [1.4, 3.2] });
      k.scatter('crate', 14, { rmin: 10, rmax: 52 });
      k.particles({ kind: 'dust', count: 900, color: 0xe8c89a, size: 0.09, opacity: 0.45, top: 16 });
    },
  },

  cenit: {
    half: 48, seed: 4242,
    spawn: { x: 0, z: 23 },
    boxes: [[0, 1.2, -2.6, 0], [-40, 0, -8, PI / 2]],
    menuCam: [0, 8, 30],
    env: { top: 0x1a2050, bottom: 0x2a3060, ground: 0x101420, sun: [-50, 35, 60], sunColor: 0xcfe0ff, sunPower: 14 },
    exposure: 1.1,
    build(k) {
      const { THREE } = k;
      k.materials({ metal: '#8d97a8', dark: '#3d4554', glow: 0x3ad0ff, crate: '#3e4652', glowIntensity: 2 });
      k.sky({ top: 0x02030a, mid: 0x101634, bottom: 0x05060f, sun: [-50, 35, 60], sunColor: 0xcfe0ff, sunSize: 0.0008, haze: 0.6, stars: 1, nebula: 0x6a3aa0, nebulaStrength: 0.4, fog: [0x0b1026, 140, 1400] });
      k.lights({ hemi: [0x7d8cff, 0x1a1530, 0.5], sun: [0xd8e4ff, 1.9], fill: [0xff9a60, 0.6, [60, 10, -80]] });
      k.planet({ pos: [300, -80, -900], radius: 420, colors: ['#d9a066', '#b5724a', '#e8c89a', '#8a4f3a', '#f0dcc0'], atmo: 0xffb070, ringed: true });
      k.ring({ pos: [-700, 380, 200], rot: [0.5, 0.3, 1.2], radius: 650, width: 34, tint: 0xbfd0e8, seed: 5 });
      k.ground({ kind: 'tiles', tile: 4, variation: 0.15 });

      // Borde y casco inferior de la plataforma flotante.
      const E = 48 + 8;
      k.block(0, -1.25, 0, E * 2, 1.2, E * 2, { mat: 'dark', cham: 6, collide: false, shadow: false });
      for (const sg of [-1, 1]) { k.strip(0, -0.4, sg * (E - 0.6), E * 2 - 12, 0.15, 0.1); k.strip(sg * (E - 0.6), -0.4, 0, 0.1, 0.15, E * 2 - 12); }
      const keel = new THREE.Mesh(new THREE.CylinderGeometry(E * 1.05, 6, 70, 8, 1), k.M.dark);
      keel.position.y = -36.3; keel.rotation.y = PI / 8;
      k.add(keel);
      const ringGlow = new THREE.Mesh(new THREE.TorusGeometry(E * 0.62, 0.35, 6, 8), k.M.glow);
      ringGlow.rotation.x = PI / 2; ringGlow.rotation.z = PI / 8; ringGlow.position.y = -18;
      k.add(ringGlow);
      // Plataformas lejanas.
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * PI * 2 + 0.4, d = 170 + k.rng() * 160, x = Math.cos(a) * d, z = Math.sin(a) * d, y = -40 + k.rng() * 90;
        const s = 18 + k.rng() * 24;
        k.block(x, y, z, s, 3, s, { mat: 'dark', cham: s * 0.3, collide: false, shadow: false });
        const under = new THREE.Mesh(new THREE.CylinderGeometry(s * 0.6, 1, s * 1.2, 8), k.M.dark);
        under.position.set(x, y - s * 0.6, z); under.rotation.y = PI / 8;
        k.add(under);
        k.block(x, y + 3, z, s * 0.18, s * (0.6 + k.rng()), s * 0.18, { mat: 'struct', cham: s * 0.05, top: 0.4, collide: false, shadow: false });
      }

      k.keep(0, 23, 6);
      k.perimeter({ style: 'barrier', h: 7 });

      // Estrado central y emblema.
      k.platform(0, 0, 12, 12, 1.2, { stairs: ['n', 's', 'e', 'w'], stairW: 3, parapet: false });
      k.holo(0, 6.5, 0, 2.6);
      k.light(0, 4, 0, 0x3ad0ff, 60, 26);

      // Torres con escalera y ascensor gravitatorio.
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        const x = sx * 30, z = sz * 30;
        k.platform(x, z, 7, 7, 4.8, { stairs: [sx > 0 ? 'w' : 'e'], stairW: 3, cham: 1.2 });
        k.pillar(x + sx * 2.4, z + sz * 2.4, 3.2, 0.8, { y: 4.8 });
        k.lift(x, z - sz * 6.6, [x, 4.8, z]);
        k.light(x, 7, z, 0x3ad0ff, 40, 18);
      }
      k.wall(-14, 0, 1, 7, 1.6); k.wall(14, 0, 1, 7, 1.6);
      k.wall(0, -14, 7, 1, 1.6); k.wall(0, 14, 7, 1, 1.6);
      k.wall(-34, 0, 1.2, 10, 2.2); k.wall(34, 0, 1.2, 10, 2.2);
      k.wall(0, -34, 10, 1.2, 2.2);
      k.scatter('crate', 12, { rmin: 10, rmax: 44 });
      k.particles({ kind: 'motes', count: 500, color: 0x7fe8ff, size: 0.1, opacity: 0.8, top: 18 });
    },
  },

  puerto: {
    half: 52, seed: 909,
    spawn: { x: 0, z: 34 },
    boxes: [[0, 4.2, 0, 0], [-34, 0, 20, 0]],
    menuCam: [0, 8, 32],
    env: { top: 0x0a0e1e, bottom: 0x1a1a2e, ground: 0x0c0f18, sun: [-30, 40, 50], sunColor: 0x9fb0ff, sunPower: 6 },
    exposure: 1.3,
    grade: { sat: 1.2, contrast: 1.1, tint: 0xe6eaff, bloom: 0.9, vignette: 0.42 },
    build(k) {
      const { THREE } = k;
      k.materials({ metal: '#5c6470', dark: '#232832', glow: 0xff3fa8, crate: '#384050', hull: '#2a3140', glowIntensity: 2.4 });
      const cyan = new THREE.MeshBasicMaterial({ color: 0x3af0ff, toneMapped: false });
      k.sky({ top: 0x03050c, mid: 0x161c30, bottom: 0x090b14, sun: [-30, 40, 50], sunColor: 0x9fb0ff, sunSize: 0.0006, haze: 0.4, fog: [0x0c1222, 30, 380] });
      k.lights({ hemi: [0x7484d6, 0x0a0a14, 0.55], sun: [0xa8b8ff, 1.0], fill: [0xff4fa8, 0.45, [-60, 18, 40]] });
      k.ground({ kind: 'tiles', tile: 4, variation: 0.25 });
      k.keep(0, 34, 7);
      k.perimeter({ style: 'barrier', h: 7 });

      // Torre de control central: plataforma con escaleras y ascensor.
      k.platform(0, 0, 10, 10, 4.2, { stairs: ['e', 'w'], stairW: 3, mat: 'hull', cham: 0.6 });
      k.lift(0, -8.5, [0, 4.2, -2]);
      k.pillar(-3.6, 3.6, 3.4, 0.7, { y: 4.2 });
      k.pillar(3.6, 3.6, 3.4, 0.7, { y: 4.2 });
      k.block(0, 7.6, 3.6, 8, 0.4, 1.6, { mat: 'dark', cham: 0.1 });
      k.strip(0, 7.5, 4.45, 7.6, 0.12, 0.05, cyan);
      k.light(0, 7, 0, 0xff3fa8, 50, 24);

      // Patio de contenedores: hileras con pasillos, algunos apilados.
      const C = [0x7a2a22, 0x1f4f7a, 0x2f5a3a, 0xa06a1e, 0x4a4f58];
      const rows = [[-26, -24, 0], [-26, -14, 0], [26, 24, 0], [26, 14, 0], [-20, 22, PI / 2], [20, -22, PI / 2], [-38, -2, PI / 2], [38, 2, PI / 2]];
      rows.forEach(([x, z, r], i) => {
        const ax = Math.abs(Math.sin(r)) > 0.5;
        for (let j = -1; j <= 1; j++) {
          if ((i + j) % 4 === 3) continue; // hueco para pasar
          const cx = x + (ax ? 0 : j * 6.6), cz = z + (ax ? j * 6.6 : 0);
          container(k, cx, cz, r, 0, C[(i * 3 + j + 3) % C.length], j === 0 ? (i % 2 ? cyan : k.M.glow) : null);
          if ((i + j) % 3 === 0) container(k, cx, cz, r, 2.6, C[(i + j + 7) % C.length]);
        }
      });
      // Grúas pórtico en las esquinas (decorado alto).
      for (const [sx, sz] of [[-1, -1], [1, 1]]) {
        const x = sx * 42, z = sz * 40;
        for (const o of [-5, 5]) k.block(x + o, 0, z, 1, 16, 1, { mat: 'hull', cham: 0.1 });
        k.block(x, 16, z, 12, 1.2, 1.4, { mat: 'hull', cham: 0.2 });
        k.strip(x, 16.7, z, 11.6, 0.1, 1.45, k.M.glow);
        k.light(x, 14, z, sx > 0 ? 0x3af0ff : 0xff3fa8, 30, 22);
      }
      k.wall(-12, 10, 6, 1, 1.4); k.wall(12, -10, 6, 1, 1.4);
      k.wall(-10, -12, 1, 6, 1.4); k.wall(10, 12, 1, 6, 1.4);
      k.scatter('crate', 10, { rmin: 10, rmax: 46 });
      k.rain({ count: 1900 });
      k.storm({ every: [10, 22] });
    },
  },

  selva: {
    half: 56, seed: 5150,
    spawn: { x: 0, z: 38 },
    boxes: [[0, 6.4, 0, 0], [30, 0, -30, 0]],
    menuCam: [0, 10, 42],
    env: { top: 0x6a9ac0, bottom: 0xc8d8b8, ground: 0x3a5030, sun: [-40, 60, 30], sunColor: 0xfff0c8 },
    exposure: 1.0,
    grade: { sat: 1.16, contrast: 1.05, tint: 0xf4fff0, bloom: 0.5, vignette: 0.36 },
    build(k) {
      k.materials({ metal: '#8f9a7e', dark: '#4a5442', glow: 0x6dffb0, rock: '#6e7462', crate: '#5a5038' });
      k.sky({ top: 0x5f8fb8, mid: 0xd8e6d0, bottom: 0x8fa080, sun: [-40, 60, 30], sunColor: 0xfff0c8, haze: 1.6, fog: [0xa9b99a, 28, 280] });
      k.lights({ hemi: [0xe0f0d0, 0x3a4a2a, 0.7], sun: [0xfff0d0, 2.2] });
      k.clouds({ count: 14, opacity: 0.55 });
      k.ground({ kind: 'grass', tile: 6 });
      k.terrain({ start: 4, rise: 50, base: 8, amp: 60, freq: 0.008, far: 0.05, colors: ['#3f5a30', '#4c6838', '#6a7a58', '#8a9a78'], levels: [0.3, 0.6, 0.85], steep: '#5a6048' });
      k.keep(0, 38, 7);
      k.perimeter({ style: 'rock', h: 9 });

      // Templo escalonado de tres pisos en el centro.
      k.platform(0, 0, 20, 20, 2, { stairs: ['n', 's', 'e', 'w'], stairW: 4 });
      k.block(0, 2, 0, 13, 2.2, 13, { mat: 'struct', cham: 0.6 });
      k.stairs(0, -6.5, 'n', 3.5, 4.2, 'struct');
      k.stairs(0, 6.5, 's', 3.5, 4.2, 'struct');
      k.block(0, 4.2, 0, 7, 2.2, 7, { mat: 'struct', cham: 0.5 });
      k.stairs(3.5, 0, 'e', 3, 6.4, 'struct');
      for (const [x, z] of [[-2.6, -2.6], [2.6, -2.6], [-2.6, 2.6], [2.6, 2.6]]) k.pillar(x, z, 3, 0.7, { y: 6.4 });
      k.holo(0, 10.5, 0, 2);
      k.light(0, 8, 0, 0x6dffb0, 45, 24);

      // Ruinas alrededor: arcos, monolitos caídos y muros rotos.
      k.arch(-32, -12, 8, 6, 'z');
      k.arch(30, 16, 8, 6, 'x');
      k.arch(0, -40, 9, 6.5, 'x');
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * PI * 2 + 0.3;
        k.pillar(Math.cos(a) * 27, Math.sin(a) * 27, 3 + (i % 3) * 2.5, 1.6);
      }
      k.wall(-18, 24, 7, 1.2, 1.6); k.wall(20, -24, 7, 1.2, 1.6);
      k.wall(-24, -26, 1.2, 6, 1.8); k.wall(24, 26, 1.2, 6, 1.8);
      for (const [sx, sz] of [[-1, 1], [1, -1]]) k.bunker(sx * 40, sz * 36, sx, sz);
      k.scatter('rock', 16, { rmin: 12, rmax: 52, size: [1.4, 3] });
      k.scatter('crate', 8, { rmin: 14, rmax: 50 });
      k.trees({ count: 260, rmin: 4, rmax: 180, crown: 0x2c4a24 });
      k.grass({ count: 3600, color: 0x6f9a48 });
      k.particles({ kind: 'motes', count: 450, color: 0xd8ff9a, size: 0.07, opacity: 0.85, top: 9 });
    },
  },
};
