import * as THREE from 'three';
import { buildGun } from './guns.js';
import { skyEnvironment } from './world.js';
import { CFG } from './config.js';

// Iluminación de estudio común a la vista previa y a las miniaturas.
function studio(scene, renderer) {
  scene.environment = skyEnvironment(renderer);
  scene.add(new THREE.HemisphereLight(0xdcecff, 0x2a2f36, 0.6));
  const key = new THREE.DirectionalLight(0xfff1dc, 2.6);
  key.position.set(2.5, 3.5, 1.5);
  const rim = new THREE.DirectionalLight(0x6fd8ff, 2.4);
  rim.position.set(-2.5, 1.5, -2);
  const fill = new THREE.DirectionalLight(0xffffff, 0.8);
  fill.position.set(1, -1, 3);
  scene.add(key, rim, fill);
  return key;
}

// Centra el arma en el origen; devuelve su caja.
function centered(id) {
  const gun = buildGun(id);
  const b = new THREE.Box3().setFromObject(gun.group);
  gun.group.position.sub(b.getCenter(new THREE.Vector3()));
  const holder = new THREE.Group();
  holder.add(gun.group);
  return { holder, size: b.getSize(new THREE.Vector3()), gun };
}

// Miniaturas de perfil (cañón a la derecha), generadas una vez con un renderer temporal.
let THUMBS = null;
export function gunThumbnails() {
  if (THUMBS) return THUMBS;
  THUMBS = {};
  const W = 360, H = 150;
  let r;
  try {
    r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  } catch {
    return THUMBS;
  }
  r.setSize(W, H, false);
  r.outputColorSpace = THREE.SRGBColorSpace;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 1.15;
  r.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  studio(scene, r);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10);
  for (const id of Object.keys(CFG.weapons)) {
    const { holder, size } = centered(id);
    scene.add(holder);
    const half = Math.max(size.z / 2, (size.y / 2) * (W / H)) * 1.06;
    Object.assign(cam, { left: -half, right: half, top: half * (H / W), bottom: -half * (H / W) });
    cam.updateProjectionMatrix();
    cam.position.set(3, 0.35, 0);
    cam.lookAt(0, 0, 0);
    r.render(scene, cam);
    THUMBS[id] = r.domElement.toDataURL('image/png');
    scene.remove(holder);
  }
  r.dispose();
  r.forceContextLoss();
  return THUMBS;
}

// Vista previa 3D giratoria del arma (menú de armas).
export class GunViewer {
  constructor(canvas) {
    this.canvas = canvas;
    this.visible = false;
    this.yaw = 0;
    this.pitch = 0.12;
    this.dist = 1;
    this.drag = null;
    this.t = 0;
  }

  init() {
    if (this.renderer) return;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true }));
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.3;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    const key = studio(this.scene, r);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -1, right: 1, top: 1, bottom: -1, near: 0.5, far: 10 });
    key.shadow.radius = 4;
    this.camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.05, 20);
    this.pivot = new THREE.Group();
    this.scene.add(this.pivot);
    // Suelo que solo recibe sombra + anillo luminoso.
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6).rotateX(-Math.PI / 2), new THREE.ShadowMaterial({ opacity: 0.45 }));
    this.floor.receiveShadow = true;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.98, 1, 96).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x5fe1ff, transparent: true, opacity: 0.35 }));
    this.scene.add(this.floor, this.ring);

    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => { this.drag = { x: e.clientX, y: e.clientY, yaw: this.yaw, pitch: this.pitch }; c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      this.yaw = this.drag.yaw + (e.clientX - this.drag.x) * 0.01;
      this.pitch = THREE.MathUtils.clamp(this.drag.pitch + (e.clientY - this.drag.y) * 0.006, -0.5, 0.9);
    });
    const end = () => { if (this.drag) this.t = 0; this.drag = null; };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.dist = THREE.MathUtils.clamp(this.dist * (e.deltaY > 0 ? 1.1 : 0.9), 0.45, 1.6);
    }, { passive: false });
    new ResizeObserver(() => this.resize()).observe(c);
  }

  resize() {
    if (!this.renderer) return;
    const w = this.canvas.clientWidth || 480, h = this.canvas.clientHeight || 270;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  setGun(id) {
    if (!this.renderer || this.id === id) return;
    this.id = id;
    this.pivot.clear();
    const { holder, size } = centered(id);
    this.pivot.add(holder);
    holder.traverse((o) => { if (o.isMesh) o.castShadow = !o.material.isMeshBasicMaterial && !o.material.transparent; });
    this.size = size;
    this.floor.position.y = this.ring.position.y = -size.y / 2 - 0.03;
    this.ring.scale.setScalar(Math.max(size.z, 0.4) * 0.5);
  }

  show(id) {
    this.init();
    this.visible = true;
    this.resize();
    if (id) this.setGun(id);
    let last = performance.now();
    const loop = (now) => {
      // Se detiene sola si el menú se cierra por otra vía (p. ej. el anfitrión inicia la partida).
      if (!this.visible || !this.canvas.offsetParent) { this.visible = false; return; }
      requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      this.t += dt;
      // Sin arrastrar: oscila suavemente alrededor de la vista de perfil.
      const yaw = this.drag ? this.yaw : this.yaw + Math.sin(this.t * 0.5) * 0.55;
      this.pivot.rotation.set(0, yaw, 0);
      const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
      const len = Math.max(this.size?.z ?? 1, 0.55), tall = this.size?.y ?? 0.3;
      const fit = Math.max(len / 2 / (tan * this.camera.aspect), tall / 2 / tan) * 1.45 * this.dist;
      this.camera.position.set(Math.cos(this.pitch) * fit, Math.sin(this.pitch) * fit, 0);
      this.camera.lookAt(0, 0, 0);
      this.renderer.render(this.scene, this.camera);
    };
    requestAnimationFrame(loop);
  }

  hide() {
    this.visible = false;
  }
}
