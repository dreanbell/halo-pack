import * as THREE from 'three';
import { EMOTES } from '../shared/emotes.js';

// Animaciones de los emotes, hechas por código (obra propia, sin licencias externas). Cada una es una función
// del tiempo que rellena una pose con ángulos por articulación; applyEmote() la pone en el esqueleto
// procedural de avatar.js, y las skins 3D la copian de él como cualquier otra pose.
//
// Convenio de la pose (el del catálogo): personaje mirando a +Z, L = +1 lado izquierdo, R = -1 derecho.
//   Raíz: px, pz (desplazamiento), yaw, pitch (hacia delante), roll, lift (despegue del suelo).
//   Columna spX (inclinar al frente), spY (girar), spZ (ladear) · cabeza hX (asentir), hY (negar), hZ (ladear).
//   Brazo: az (abrir hacia fuera), ax (subir al frente), ez/ex (lo mismo para el antebrazo respecto al brazo).
//   Pierna: hz (abrir), hx (subir al frente), k (doblar rodilla), kz (girar la espinilla hacia dentro).
const { sin: S, abs, max, min, PI, floor } = Math;
const L = 1, R = -1;
const ease = (x) => x * x * (3 - 2 * x);
const clamp01 = (x) => max(0, min(1, x));
const bell = (t, a, b) => ease(clamp01((t - a) / 0.35)) * (1 - ease(clamp01((t - b) / 0.35)));
const intro = (t) => ease(clamp01((t - 0.1) / 0.45));

function base() {
  return {
    px: 0, pz: 0, yaw: 0, pitch: 0, roll: 0, lift: 0, spX: 0, spY: 0, spZ: 0, hX: 0, hY: 0, hZ: 0,
    arm: { [L]: { az: 0.16, ax: 0.05, ez: 0, ex: 0.18 }, [R]: { az: 0.16, ax: 0.05, ez: 0, ex: 0.18 } },
    leg: { [L]: { hz: 0.05, hx: 0, k: 0, kz: 0 }, [R]: { hz: 0.05, hx: 0, k: 0, kz: 0 } },
  };
}
const leg = (hz, hx, k, kz = 0) => ({ hz, hx, k, kz });

const POSES = {
  robot(t, p) {
    const st = floor(t / 0.4) % 8, ph = [0, 1, 0, -1, 0, 1, 1, -1][st];
    p.arm[L] = { az: 0.2, ax: 1.57 + ph * 0.3, ez: 0, ex: st % 2 ? 1.57 : 0 }; p.arm[R] = { az: 0.2, ax: 1.57 - ph * 0.3, ez: 0, ex: st % 2 ? 0 : 1.57 };
    p.hY = ph * 0.45; p.spY = ph * 0.2; p.yaw = st > 3 ? 0.4 : 0;
  },
  lateral(t, p) {
    const ph = S(t * 2 * PI / 1.6), b = abs(S(t * 2 * PI / 0.8));
    p.px = ph * 0.22; p.roll = -ph * 0.06; p.spZ = ph * 0.1;
    p.leg[L] = leg(0.08 + max(0, ph) * 0.25, 0.1 * b, 0.3 * b); p.leg[R] = leg(0.08 + max(0, -ph) * 0.25, 0.1 * b, 0.3 * b);
    p.arm[L] = { az: 0.4, ax: 0.6 + ph * 0.3, ez: 0, ex: 1.6 }; p.arm[R] = { az: 0.4, ax: 0.6 - ph * 0.3, ez: 0, ex: 1.6 }; p.hZ = ph * 0.12;
  },
  headbang(t, p) {
    const h = (S(t * 2 * PI * 2) + 1) / 2; p.spX = 0.15 + h * 0.3; p.hX = h * 0.5 - 0.1;
    p.arm[R] = { az: 2.5, ax: 0.4, ez: 0, ex: 0.5 }; p.arm[L] = { az: 0.6, ax: 0.9, ez: 0, ex: 1.4 };
    for (const s of [L, R]) p.leg[s] = leg(0.05, 0.15, 0.25);
  },
  disco(t, p) {
    const w = S(t * 2 * PI / 1.6), ph = w > 0 ? 1 : 0, sm = (w + 1) / 2;
    p.arm[R] = { az: 0.3 + sm * 2.3, ax: 0.4 - sm * 0.2, ez: 0, ex: 0.1 }; p.arm[L] = { az: 0.9, ax: 0.2, ez: 0, ex: 1.8 };
    p.roll = (sm - 0.5) * 0.15; p.spZ = (0.5 - sm) * 0.25; p.leg[R] = leg(0.15, 0.15 * ph, 0.35 * ph); p.hZ = (sm - 0.5) * -0.2;
  },
  caderas(t, p) {
    const ph = S(t * 2 * PI / 1.2); p.px = ph * 0.06; p.roll = ph * 0.14; p.spZ = -ph * 0.22; p.hZ = ph * 0.1;
    for (const s of [L, R]) { p.arm[s] = { az: 0.75, ax: -0.15, ez: -1.2, ex: 0.9 }; p.leg[s] = leg(0.05, max(0, s * ph) * 0.2, 0.15 + max(0, s * ph) * 0.4); }
  },
  giro(t, p) {
    const k = ease(clamp01((t - 0.2) / 1.2)); p.yaw = k * 2 * PI;
    for (const s of [L, R]) p.arm[s] = { az: 1.45, ax: 0.1, ez: 0, ex: 0.2 };
    p.leg[R] = leg(0.05, 0.3 * S(k * PI), 0.9 * S(k * PI)); p.hX = -0.1;
  },
  ola(t, p) {
    const w = t * 2 * PI / 1.6;
    p.arm[L] = { az: 1.5 + S(w) * 0.35, ax: 0.1, ez: S(w - 1.2) * 0.8, ex: 0.1 }; p.arm[R] = { az: 1.5 + S(w - 2.4) * 0.35, ax: 0.1, ez: S(w - 3.6) * 0.8, ex: 0.1 };
    p.spZ = S(w - 1.8) * 0.08; p.hZ = S(w - 1.8) * 0.15;
  },
  dab(t, p) {
    const k = bell(t, 0.15, 1.3);
    p.arm[R] = { az: 0.16 + k * 2.05, ax: 0.05 + k * 0.15, ez: 0, ex: 0.18 }; p.arm[L] = { az: 0.16 + k * 1.75, ax: 0.05 + k * 0.6, ez: -k * 0.3, ex: 0.18 + k * 2.3 };
    p.spX = k * 0.25; p.spZ = k * 0.15; p.hX = k * 0.55; p.hY = k * 0.5;
  },
  venaqui(t, p) {
    const k = bell(t, 0.05, 2.0), f = (S(t * 2 * PI / 0.6) + 1) / 2;
    p.arm[R] = { az: 0.16 + k * 0.09, ax: 0.05 + k * 1.3, ez: 0, ex: 0.18 + k * (0.2 + f * 1.4) }; p.spX = -0.05 * k; p.hZ = 0.1 * k; p.leg[L].hx = 0.15 * k;
  },
  hombros(t, p) {
    const k = bell(t, 0.15, 1.2); for (const s of [L, R]) p.arm[s] = { az: 0.16 + k * 0.5, ax: 0.05 + k * 0.25, ez: 0, ex: 0.18 + k * 1.45 }; p.hZ = 0.2 * k; p.lift = 0.03 * k;
  },
  risa(t, p) {
    const k = bell(t, 0.1, 1.2), j = S(t * 22) * 0.04 * k; p.spX = k * 0.45 + j; p.hX = -0.25 * k + j;
    p.arm[R] = { az: 0.16 - k * 0.16, ax: 0.05 + k * 0.55, ez: 0, ex: 0.18 + k * 1.4 }; p.arm[L] = { az: 0.16 - k * 0.16, ax: 0.05 + k * 0.45, ez: 0, ex: 0.18 + k * 1.3 };
    for (const s of [L, R]) p.leg[s].k = 0.25 * k;
  },
  reloj(t, p) {
    const k = bell(t, 0.1, 1.9), tap = max(0, S(t * 2 * PI / 0.5)) * k;
    p.arm[L] = { az: 0.16 - k * 0.36, ax: 0.05 + k * 0.8, ez: 0, ex: 0.18 + k * 1.57 }; p.hX = 0.35 * k; p.hY = 0.2 * k;
    p.arm[R] = { az: 0.16 + k * 0.39, ax: 0.05 - k * 0.15, ez: -1.1 * k, ex: 0.18 + k * 0.72 }; p.leg[R] = leg(0.08, 0.25 * k, tap * 0.15);
  },
  facepalm(t, p) {
    const k = bell(t, 0.2, 1.7); p.arm[R] = { az: 0.16 + k * 0.1, ax: 0.05 + k * 1.05, ez: k * 0.2, ex: 0.18 + k * 2.2 }; p.hX = 0.4 * k; p.spX = 0.1 * k;
  },
  zombie(t, p) {
    const w = S(t * 2 * PI / 2); for (const s of [L, R]) p.arm[s] = { az: 0.05, ax: 1.5 + S(t * 3 + s) * 0.06, ez: 0, ex: 0.1 };
    p.hZ = 0.35 + w * 0.1; p.hX = 0.2; p.spZ = w * 0.08; p.leg[L] = leg(0.05, max(0, w) * 0.35, max(0, w) * 0.4); p.leg[R] = leg(0.05, max(0, -w) * 0.35, max(0, -w) * 0.4);
  },
  estirar(t, p) {
    const k = bell(t, 0.2, 1.8); for (const s of [L, R]) p.arm[s] = { az: 0.16 + k * 2.75, ax: 0.05 + k * 0.1, ez: 0, ex: 0.18 + k * 0.1 }; p.spX = -0.2 * k; p.hX = -0.4 * k; p.lift = 0.04 * k;
  },
  senalar(t, p) {
    const k = bell(t, 0.15, 1.4); p.arm[R] = { az: 0.16 + k * 0.15, ax: 0.05 + k * 1.5, ez: 0, ex: 0.18 - k * 0.15 }; p.spY = -0.2 * k; p.hY = -0.2 * k; p.leg[L].hx = 0.2 * k;
  },
  rendicion(t, p) {
    const k = bell(t, 0.1, 1.5), sh = S(t * 25) * 0.02 * k; for (const s of [L, R]) p.arm[s] = { az: 0.16 + k * 1.3, ax: 0.05 + k * 0.1, ez: k * 1.4 + sh, ex: 0.18 }; p.hX = 0.15 * k;
  },
  sentarse(t, p) {
    const k = intro(t); p.pitch = -0.15 * k;
    for (const s of [L, R]) { p.leg[s] = leg(0.08 + 0.1 * k, k * 1.55 - (s === L ? 0 : 0.25 * k), s === L ? 0.1 * k : 0.8 * k); p.arm[s] = { az: 0.25 + 0.1 * k, ax: -0.55 * k, ez: 0, ex: 0.1 }; }
    p.spX = -0.05 * k + S(t * 1.8) * 0.015 * k;
  },
  flexiones(t, p) {
    const k = intro(t), d = (S(max(0, t - 0.6) * 2 * PI / 0.9 - PI / 2) + 1) / 2 * k;
    p.pitch = k * 1.42;
    for (const s of [L, R]) { p.arm[s] = { az: 0.2 + 0.1 * k, ax: 0.05 + k * 1.35 - d * 0.35, ez: 0, ex: 0.1 + d * 1.1 }; p.leg[s] = leg(0.05, 0, 0); }
    p.hX = -0.6 * k;
  },
  meditar(t, p) {
    const k = intro(t); p.lift = k * (0.18 + S(t * 2.5) * 0.04);
    for (const s of [L, R]) { p.leg[s] = leg(0.05 + k * 0.6, k * 1.5, 0, -k * (s === L ? 1.75 : 1.55)); p.arm[s] = { az: 0.16 + k * 0.35, ax: 0.05 + k * 0.55, ez: 0, ex: 0.18 + k * 0.6 }; }
    p.hX = 0.12 * k;
  },
};
for (const e of EMOTES) if (!POSES[e.id]) throw new Error(`Falta la animación del emote ${e.id}`);

// Tiempo de animación según el modo (loop: en bucle · once/hold: avanza sin repetirse).
export const emoteTime = (i, t) => (EMOTES[i].mode === 'loop' ? t % EMOTES[i].dur : t);
// ¿Ha terminado? (solo los «once»; loop y hold duran hasta que se cancelan).
export const emoteDone = (i, t) => EMOTES[i].mode === 'once' && t >= EMOTES[i].dur;

// Instante representativo para la miniatura de la tienda.
const THUMB = { robot: 0.5, lateral: 0.4, headbang: 0.25, disco: 0.4, caderas: 0.3, giro: 0.15, ola: 0.4, dab: 0.75, venaqui: 0.9, hombros: 0.7,
  risa: 0.6, reloj: 1.0, facepalm: 0.9, zombie: 0.5, estirar: 1.0, senalar: 0.8, rendicion: 0.7, sentarse: 1.5, flexiones: 1.0, meditar: 1.6 };
export const emoteThumbTime = (i) => THUMB[EMOTES[i].id] ?? EMOTES[i].dur * 0.45;

export function emotePose(i, t) {
  const p = base();
  POSES[EMOTES[i].id](emoteTime(i, t), p);
  return p;
}

// Pone la pose en el esqueleto de avatar.js (que mira a -Z: se invierten X y Z, y el lado del avatar es -s).
// Por cuaterniones: el orden de Euler de cada hueso no cambia (la animación normal sigue usando XYZ).
const _e = new THREE.Euler();
export function applyPose(av, p) {
  av.hips.quaternion.setFromEuler(_e.set(-p.pitch, p.yaw, -p.roll, 'YXZ'));
  av.hips.position.x = -p.px;
  av.hips.position.z = -p.pz;
  av.spine.quaternion.setFromEuler(_e.set(-p.spX, p.spY, -p.spZ, 'YZX'));
  av.head.quaternion.setFromEuler(_e.set(-p.hX, p.hY, -p.hZ, 'YXZ'));
  av.neck.quaternion.identity();
  for (const s of [L, R]) {
    const a = -s, A = p.arm[s], G = p.leg[s], arm = av.arms[a], lg = av.legs[a];
    arm.sh.quaternion.setFromEuler(_e.set(A.ax, 0, a * A.az, 'ZXY'));
    arm.el.quaternion.setFromEuler(_e.set(A.ex, 0, a * A.ez, 'ZXY'));
    lg.hip.quaternion.setFromEuler(_e.set(G.hx, 0, a * G.hz, 'ZXY'));
    lg.knee.quaternion.setFromEuler(_e.set(-G.k, 0, a * (G.kz ?? 0), 'ZXY'));
    lg.ankle.quaternion.setFromEuler(_e.set(-(G.hx - G.k) * 0.85, 0, 0, 'XYZ'));
  }
}
