import * as THREE from 'three';
import { plate } from './avatar.js';

// Modelos procedurales de armas (apuntan a -Z). Los usan la vista en primera persona,
// los avatares en tercera persona y la caja misteriosa.
// Cada modelo devuelve: { group, muzzle, grips: { r: [x,y,z], l: [x,y,z] }, parts }
const M = {};
function mats() {
  if (M.metal) return M;
  const std = (color, metalness, roughness, extra = {}) => new THREE.MeshStandardMaterial({ color, metalness, roughness, ...extra });
  Object.assign(M, {
    metal: std(0x5d6670, 0.75, 0.32),
    dark: std(0x262b31, 0.6, 0.45),
    olive: std(0x5f6f55, 0.35, 0.55),
    tan: std(0x8a7a5c, 0.25, 0.6),
    white: std(0xd2d6dd, 0.3, 0.35),
    wood: std(0x5a3d26, 0.1, 0.7),
    lens: new THREE.MeshPhysicalMaterial({ color: 0x1a3550, metalness: 0.9, roughness: 0.05, clearcoat: 1 }),
    alienPurple: std(0x4b2a72, 0.55, 0.22),
    alienTeal: std(0x1f5f62, 0.6, 0.25),
    alienGreen: std(0x2e5a2a, 0.55, 0.3),
    glowCyan: new THREE.MeshBasicMaterial({ color: 0x7fe7ff }),
    glowAmber: new THREE.MeshBasicMaterial({ color: 0xffb347 }),
    glowRed: new THREE.MeshBasicMaterial({ color: 0xff4d5e }),
    glowPink: new THREE.MeshBasicMaterial({ color: 0xff5ad1 }),
    glowNeedle: new THREE.MeshBasicMaterial({ color: 0xff8af0 }),
    glowGreen: new THREE.MeshBasicMaterial({ color: 0x9dff6a }),
  });
  return M;
}

const G = new Map();
const geo = (key, make) => {
  if (!G.has(key)) G.set(key, make());
  return G.get(key);
};
const cyl = (rt, rb, h, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg).rotateX(Math.PI / 2);

function builder() {
  const group = new THREE.Group();
  const add = (g, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, parent = group) => {
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = !mat.isMeshBasicMaterial;
    parent.add(m);
    return m;
  };
  return { group, add };
}

const BUILDERS = {
  rifle() {
    const m = mats(), { group, add } = builder();
    add(geo('r.body', () => plate(0.09, 0.12, 0.42, 0.02)), m.olive);
    add(geo('r.shroud', () => plate(0.1, 0.08, 0.24, 0.02)), m.olive, 0, 0.04, -0.25);
    add(geo('r.mag', () => plate(0.06, 0.16, 0.08, 0.012)), m.dark, 0, -0.12, -0.02, 0.2);
    add(geo('r.grip', () => plate(0.05, 0.13, 0.06, 0.012)), m.dark, 0, -0.1, 0.13, -0.3);
    add(geo('r.stock', () => plate(0.07, 0.1, 0.18, 0.015)), m.olive, 0, -0.02, 0.27);
    add(geo('r.barrel', () => cyl(0.018, 0.018, 0.3)), m.dark, 0, 0.02, -0.4);
    add(geo('r.counter', () => new THREE.BoxGeometry(0.05, 0.03, 0.06)), m.glowCyan, 0, 0.075, 0.08);
    return { group, muzzle: [0, 0.02, -0.57], grips: { r: [0, -0.1, 0.13], l: [0, -0.06, -0.27] } };
  },
  pistol() {
    const m = mats(), { group, add } = builder();
    add(geo('p.body', () => plate(0.07, 0.09, 0.26, 0.015)), m.white, 0, 0, -0.05);
    const coil = add(geo('p.coil', () => new THREE.BoxGeometry(0.076, 0.03, 0.14)), m.glowCyan.clone(), 0, 0.02, -0.08);
    add(geo('p.grip', () => plate(0.055, 0.14, 0.07, 0.012)), m.dark, 0, -0.1, 0.04, -0.25);
    add(geo('p.nose', () => plate(0.05, 0.05, 0.06, 0.01)), m.white, 0, 0.01, -0.2);
    return { group, muzzle: [0, 0.01, -0.25], grips: { r: [0, -0.11, 0.05], l: [-0.035, -0.12, 0.05] }, parts: { coil } };
  },
  smg() {
    const m = mats(), { group, add } = builder();
    add(geo('s.body', () => plate(0.08, 0.11, 0.3, 0.018)), m.dark);
    add(geo('s.top', () => plate(0.06, 0.03, 0.26, 0.01)), m.metal, 0, 0.065, -0.02);
    add(geo('s.mag', () => plate(0.045, 0.22, 0.055, 0.01)), m.metal, 0, -0.15, -0.04, 0.08);
    add(geo('s.grip', () => plate(0.045, 0.12, 0.055, 0.01)), m.dark, 0, -0.1, 0.09, -0.25);
    add(geo('s.fore', () => plate(0.04, 0.1, 0.045, 0.01)), m.dark, 0, -0.1, -0.15);
    add(geo('s.barrel', () => cyl(0.02, 0.02, 0.12)), m.metal, 0, 0.01, -0.2);
    add(geo('s.wire', () => new THREE.BoxGeometry(0.012, 0.012, 0.2)), m.metal, 0.03, 0, 0.24);
    add(geo('s.wire', () => new THREE.BoxGeometry(0.012, 0.012, 0.2)), m.metal, -0.03, 0, 0.24);
    add(geo('s.pad', () => plate(0.08, 0.08, 0.02, 0.008)), m.dark, 0, -0.01, 0.34);
    add(geo('s.dot', () => new THREE.BoxGeometry(0.02, 0.02, 0.02)), m.glowRed, 0, 0.09, 0.05);
    return { group, muzzle: [0, 0.01, -0.28], grips: { r: [0, -0.1, 0.09], l: [0, -0.13, -0.15] } };
  },
  shotgun() {
    const m = mats(), { group, add } = builder();
    add(geo('sg.body', () => plate(0.085, 0.11, 0.34, 0.02)), m.dark, 0, 0, 0.02);
    add(geo('sg.barrel', () => cyl(0.024, 0.024, 0.52)), m.metal, 0, 0.03, -0.38);
    add(geo('sg.tube', () => cyl(0.02, 0.02, 0.44)), m.dark, 0, -0.025, -0.34);
    const pump = add(geo('sg.pump', () => plate(0.085, 0.07, 0.17, 0.02)), m.wood, 0, -0.03, -0.32);
    add(geo('sg.grip', () => plate(0.05, 0.13, 0.06, 0.012)), m.wood, 0, -0.1, 0.17, -0.35);
    add(geo('sg.stock', () => plate(0.07, 0.12, 0.24, 0.02)), m.wood, 0, -0.04, 0.32, 0.12);
    add(geo('sg.sight', () => new THREE.BoxGeometry(0.015, 0.02, 0.02)), m.glowAmber, 0, 0.065, -0.6);
    for (let i = 0; i < 4; i++) add(geo('sg.shell', () => new THREE.CylinderGeometry(0.012, 0.012, 0.05, 8).rotateZ(Math.PI / 2)), m.glowRed, 0.048, 0.0, 0.0 + i * 0.035);
    return { group, muzzle: [0, 0.03, -0.66], grips: { r: [0, -0.1, 0.17], l: [0, -0.06, -0.32] }, parts: { pump } };
  },
  dmr() {
    const m = mats(), { group, add } = builder();
    add(geo('d.body', () => plate(0.085, 0.12, 0.46, 0.02)), m.tan);
    add(geo('d.barrel', () => cyl(0.017, 0.017, 0.36)), m.dark, 0, 0.02, -0.4);
    add(geo('d.scope', () => cyl(0.026, 0.026, 0.2, 14)), m.dark, 0, 0.1, -0.02);
    add(geo('d.lens', () => cyl(0.024, 0.024, 0.005, 14)), m.lens, 0, 0.1, -0.123);
    add(geo('d.mount', () => plate(0.03, 0.04, 0.08, 0.008)), m.dark, 0, 0.065, -0.02);
    add(geo('d.mag', () => plate(0.055, 0.15, 0.08, 0.012)), m.dark, 0, -0.12, -0.04, 0.12);
    add(geo('d.grip', () => plate(0.05, 0.13, 0.06, 0.012)), m.dark, 0, -0.1, 0.14, -0.3);
    add(geo('d.stock', () => plate(0.075, 0.12, 0.2, 0.02)), m.tan, 0, -0.02, 0.32);
    add(geo('d.brake', () => cyl(0.026, 0.026, 0.05)), m.dark, 0, 0.02, -0.6);
    return { group, muzzle: [0, 0.02, -0.64], grips: { r: [0, -0.1, 0.14], l: [0, -0.06, -0.28] } };
  },
  sniper() {
    const m = mats(), { group, add } = builder();
    add(geo('sn.body', () => plate(0.08, 0.11, 0.5, 0.02)), m.dark, 0, 0, 0.02);
    add(geo('sn.barrel', () => cyl(0.016, 0.02, 0.62)), m.metal, 0, 0.02, -0.52);
    add(geo('sn.brake', () => plate(0.05, 0.04, 0.08, 0.01)), m.dark, 0, 0.02, -0.86);
    add(geo('sn.scope', () => cyl(0.034, 0.034, 0.32, 16)), m.dark, 0, 0.11, -0.04);
    add(geo('sn.bell', () => cyl(0.045, 0.034, 0.06, 16)), m.dark, 0, 0.11, -0.22);
    add(geo('sn.lens', () => cyl(0.042, 0.042, 0.005, 16)), m.lens, 0, 0.11, -0.252);
    add(geo('sn.mount', () => plate(0.03, 0.05, 0.16, 0.008)), m.metal, 0, 0.07, -0.04);
    add(geo('sn.mag', () => plate(0.05, 0.09, 0.09, 0.012)), m.metal, 0, -0.09, -0.02);
    add(geo('sn.grip', () => plate(0.05, 0.13, 0.06, 0.012)), m.dark, 0, -0.1, 0.17, -0.3);
    add(geo('sn.stock', () => plate(0.07, 0.15, 0.28, 0.02)), m.olive, 0, -0.03, 0.38);
    for (const s of [-1, 1]) add(geo('sn.leg', () => new THREE.BoxGeometry(0.012, 0.012, 0.22)), m.metal, s * 0.025, -0.02, -0.42, 0, s * 0.05);
    add(geo('sn.dot', () => new THREE.BoxGeometry(0.012, 0.012, 0.02)), m.glowRed, 0.04, 0.11, -0.04);
    return { group, muzzle: [0, 0.02, -0.92], grips: { r: [0, -0.1, 0.17], l: [0, -0.06, -0.3] } };
  },
  plasma() {
    const m = mats(), { group, add } = builder();
    const shell = add(geo('pl.shell', () => new THREE.SphereGeometry(0.1, 24, 16)), m.alienPurple, 0, 0, -0.08);
    shell.scale.set(0.8, 0.62, 2.1);
    add(geo('pl.core', () => new THREE.SphereGeometry(0.05, 16, 10)), m.glowPink, 0, 0.035, -0.12).scale.set(0.7, 0.5, 1.8);
    for (const s of [-1, 1]) {
      add(geo('pl.prong', () => new THREE.TorusGeometry(0.11, 0.016, 8, 16, Math.PI * 0.7)), m.alienPurple, s * 0.05, 0, -0.26, 0, Math.PI / 2, s > 0 ? Math.PI * 0.65 : -Math.PI * 0.35);
      add(geo('pl.tip', () => new THREE.SphereGeometry(0.018, 10, 8)), m.glowPink, s * 0.05, 0.04, -0.34);
    }
    add(geo('pl.grip', () => plate(0.05, 0.12, 0.06, 0.015)), m.alienTeal, 0, -0.09, 0.05, -0.25);
    add(geo('pl.fin', () => plate(0.015, 0.06, 0.16, 0.006)), m.alienTeal, 0, 0.07, 0.02);
    return { group, muzzle: [0, 0.02, -0.36], grips: { r: [0, -0.1, 0.06], l: [0, -0.08, -0.18] }, parts: { core: shell } };
  },
  needler() {
    const m = mats(), { group, add } = builder();
    const body = add(geo('n.body', () => new THREE.SphereGeometry(0.1, 20, 14)), m.alienTeal, 0, 0, -0.06);
    body.scale.set(0.75, 0.7, 2);
    const spikes = new THREE.Group();
    group.add(spikes);
    for (let i = 0; i < 7; i++) {
      const a = (i / 6 - 0.5) * 1.6;
      add(geo('n.spike', () => new THREE.ConeGeometry(0.012, 0.11, 6)), m.glowNeedle, Math.sin(a) * 0.04, 0.08 + Math.cos(a) * 0.01, -0.2 + i * 0.045, -0.5, 0, a * 0.6, spikes);
    }
    add(geo('n.grip', () => plate(0.05, 0.13, 0.06, 0.015)), m.alienPurple, 0, -0.1, 0.07, -0.3);
    add(geo('n.mouth', () => cyl(0.03, 0.04, 0.05, 10)), m.alienPurple, 0, 0, -0.27);
    return { group, muzzle: [0, 0, -0.3], grips: { r: [0, -0.1, 0.08], l: [0, -0.09, -0.16] }, parts: { spikes } };
  },
  arc() {
    const m = mats(), { group, add } = builder();
    add(geo('a.body', () => plate(0.14, 0.16, 0.5, 0.04)), m.alienGreen, 0, 0, 0.02);
    add(geo('a.tube', () => cyl(0.06, 0.07, 0.36, 16)), m.alienGreen, 0, 0.03, -0.36);
    add(geo('a.ring', () => new THREE.TorusGeometry(0.066, 0.012, 8, 20)), m.glowGreen, 0, 0.03, -0.52);
    add(geo('a.ring', () => new THREE.TorusGeometry(0.066, 0.012, 8, 20)), m.glowGreen, 0, 0.03, -0.3);
    add(geo('a.cell', () => plate(0.06, 0.08, 0.16, 0.015)), m.glowGreen, 0.075, -0.02, 0.06);
    add(geo('a.grip', () => plate(0.05, 0.13, 0.06, 0.015)), m.dark, 0, -0.13, 0.15, -0.3);
    add(geo('a.handle', () => plate(0.04, 0.1, 0.05, 0.012)), m.dark, 0, -0.12, -0.2);
    add(geo('a.fin', () => plate(0.02, 0.08, 0.3, 0.008)), m.dark, 0, 0.11, 0.02);
    return { group, muzzle: [0, 0.03, -0.56], grips: { r: [0, -0.12, 0.15], l: [0, -0.12, -0.2] } };
  },
};

export function buildGun(id) {
  const b = (BUILDERS[id] ?? BUILDERS.rifle)();
  const muzzle = new THREE.Object3D();
  muzzle.position.fromArray(b.muzzle);
  b.group.add(muzzle);
  return { group: b.group, muzzle, grips: b.grips, parts: b.parts ?? {} };
}
