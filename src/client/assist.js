import * as THREE from 'three';
import { S } from './settings.js';
import { TOUCH } from './touch.js';

// Ayudas de apuntado para pantallas táctiles (Ajustes → Controles):
// - Asistencia: cerca de un enemigo la vista se frena (fricción) y, apuntando con la mira, se desliza un poco hacia
//   él (imán suave). Un solo objetivo por fotograma; solo cuenta lo que se ve (línea de visión).
// - Giroscopio: girar el móvil mueve la vista (siempre o solo apuntando), sumándose al dedo.
const CONE = THREE.MathUtils.degToRad(7), RANGE = 70;
const _e = new THREE.Vector3(), _d = new THREE.Vector3(), _f = new THREE.Vector3(), _c = new THREE.Vector3();

export class AimAssist {
  constructor(ctx) {
    this.ctx = ctx;
    this.target = null; // { pos, ang }
    this.gyroOn = false;
    this.rate = { yaw: 0, pitch: 0 };
    this.onMotion = (e) => {
      const r = e.rotationRate;
      if (!r) return;
      // Móvil en horizontal: girar a los lados = giro sobre el eje x del dispositivo (beta); arriba/abajo = y (gamma).
      const ang = (screen.orientation?.angle ?? window.orientation ?? 90) % 360;
      const s = ang === 270 || ang === -90 ? -1 : 1;
      this.rate.yaw = (r.beta ?? 0) * s;
      this.rate.pitch = -(r.gamma ?? 0) * s;
    };
  }

  get assistOn() { return TOUCH && S.aimAssist; }

  // iOS pide permiso para el giroscopio: se llama desde un toque (al activar la opción o al empezar a jugar).
  async enableGyro() {
    if (this.gyroOn || !TOUCH || S.gyro === 'off') return;
    try {
      if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
        if ((await DeviceMotionEvent.requestPermission()) !== 'granted') return;
      }
      addEventListener('devicemotion', this.onMotion);
      this.gyroOn = true;
    } catch { /* sin giroscopio */ }
  }

  // Factor para el movimiento del dedo (fricción cerca de un objetivo).
  lookScale() {
    if (!this.assistOn || !this.target) return 1;
    return 1 - 0.45 * (1 - this.target.ang / this.target.lim);
  }

  update(dt) {
    const { player, arsenal, director, remotes, world, camera, game } = this.ctx;
    this.target = null;
    if (game.state !== 'playing' || !player.alive) return;
    // Giroscopio.
    if (this.gyroOn && S.gyro !== 'off' && (S.gyro === 'always' || arsenal.aimHeld)) {
      // rotationRate viene en grados/s: se aplica directo (más fino con zoom).
      const k = THREE.MathUtils.degToRad(1) * dt * S.gyroSens * (S.gyroInvert ? -1 : 1) / (arsenal.zoom ?? 1);
      player.yaw.rotation.y += this.rate.yaw * k;
      player.pitch.rotation.x = THREE.MathUtils.clamp(player.pitch.rotation.x + this.rate.pitch * k, -1.5, 1.5);
    }
    if (!this.assistOn) return;
    // Objetivo: el más centrado dentro del cono, a menos de RANGE m y a la vista.
    camera.getWorldPosition(_e);
    camera.getWorldDirection(_f);
    let best = null, bestK = 1, bestAng = 0, bestLim = CONE;
    const consider = (pos) => {
      _d.subVectors(pos, _e);
      const dist = _d.length();
      if (dist > RANGE || dist < 1) return;
      // Cono: 7°, o el tamaño aparente del enemigo (~1,2 m) si está cerca.
      const ang = _d.angleTo(_f), lim = Math.max(CONE, Math.atan2(1.2, dist)), k = ang / lim;
      if (k < bestK) { bestK = k; bestAng = ang; bestLim = lim; best = pos; }
    };
    for (const e of director.alive()) consider(e.center(_c).clone());
    if (arsenal.pvp) for (const r of remotes.alive()) consider(r.eye().clone().setY(r.pos.y + 1.2));
    if (!best || !world.lineOfSight(_e, best)) return;
    this.target = { pos: best, ang: bestAng, lim: bestLim };
    // Imán suave al apuntar con la mira: gira una fracción del ángulo hacia el objetivo.
    if (arsenal.aimK > 0.5) {
      _d.subVectors(best, _e).normalize();
      const yawT = Math.atan2(-_d.x, -_d.z), pitchT = Math.asin(THREE.MathUtils.clamp(_d.y, -1, 1));
      let dy = yawT - player.yaw.rotation.y;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const pull = Math.min(1, dt * 1.8);
      player.yaw.rotation.y += dy * pull;
      player.pitch.rotation.x += (pitchT - player.pitch.rotation.x) * pull * 0.6;
    }
  }
}
