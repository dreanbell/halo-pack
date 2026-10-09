import * as THREE from 'three';
import { Avatar } from './avatar.js';
import { skyEnvironment } from './world.js';
import { Q } from './quality.js';
import { PRIMARY, SECONDARY, VISORS, HELMETS, PATTERNS, MODELS, randomSkin, sanitizeSkin } from '../shared/skins.js';

// Qué opciones afectan a cada modelo (0 = procedural).
const MODEL_NOTE = [
  'Soldado procedural: colores, casco y patrón.',
  'Armadura de asalto (textura propia). El casco y el color del visor sí cambian.',
  'Armadura de asalto en verde militar. El casco y el color del visor sí cambian.',
  'Armadura de asalto renegada. El casco y el color del visor sí cambian.',
  'Servoarmadura pesada pintada con tus colores y patrón.',
  'Comando de baja poligonización, teñido con el color principal.',
  'Comando de baja poligonización, teñido con el color principal.',
  'Mono de dibujos animados (con cola).',
  'Pato de dibujos: las alas sujetan el arma.',
  'Rana patosa.',
  'Chica con garra de gancho. El color del visor cambia sus luces.',
  'Dado con brazos y piernas de fideo.',
  'Su hermano, el dado rojo.',
];

// Armería: vista previa 3D (renderer propio) + selector de colores, casco y patrón.
export class Armory {
  // locked(key, valor) → precio si está bloqueado (0 = disponible) · onLocked(key, valor): al tocar algo bloqueado.
  constructor({ canvas, skin, onChange, locked = () => 0, onLocked = () => {} }) {
    this.canvas = canvas;
    this.skin = sanitizeSkin(skin);
    this.onChange = onChange;
    this.locked = locked;
    this.onLocked = onLocked;
    this.visible = false;
    this.rotY = Math.PI;
    this.drag = null;
    this.buildControls();
  }

  init() {
    if (this.renderer) return;
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true }));
    r.setPixelRatio(Math.min(devicePixelRatio, Q.level === 'alta' ? 2 : 1.25)); // vista previa: en móvil, menos píxeles
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.shadowMap.enabled = true;
    const scene = (this.scene = new THREE.Scene());
    scene.environment = skyEnvironment(r);
    this.camera = new THREE.PerspectiveCamera(26, 1, 0.1, 30);
    this.camera.position.set(0, 1.12, 5);
    this.camera.lookAt(0, 0.98, 0);
    scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x30363c, 0.7));
    const key = new THREE.DirectionalLight(0xfff1dc, 2.4);
    key.position.set(-2, 3.5, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -1.5, right: 1.5, top: 2.5, bottom: -0.5, near: 0.5, far: 10 });
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x6fd8ff, 2.2);
    rim.position.set(2.5, 2, -3);
    scene.add(rim);
    // Pedestal con anillo luminoso.
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.82, 0.08, 48), new THREE.MeshStandardMaterial({ color: 0x1c2228, metalness: 0.7, roughness: 0.35 }));
    base.position.y = -0.04;
    base.receiveShadow = true;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.012, 8, 64).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x5fe1ff }));
    ring.position.y = 0.005;
    scene.add(base, ring);
    this.avatar = new Avatar(this.skin);
    this.avatar.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(this.avatar.root);

    this.canvas.addEventListener('pointerdown', (e) => { this.drag = { x: e.clientX, r: this.rotY }; this.canvas.setPointerCapture(e.pointerId); });
    this.canvas.addEventListener('pointermove', (e) => { if (this.drag) this.rotY = this.drag.r + (e.clientX - this.drag.x) * 0.012; });
    const end = () => { this.drag = null; };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
  }

  resize() {
    const w = this.canvas.clientWidth || 300, h = this.canvas.clientHeight || 380;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  show() {
    this.init();
    this.visible = true;
    this.resize();
    this.syncControls();
    let last = performance.now();
    const loop = (now) => {
      if (!this.visible) return;
      requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!this.drag) this.rotY += dt * 0.35;
      this.avatar.root.rotation.y = this.rotY;
      this.avatar.animate(dt, { speed: 0, pitch: 0, alive: true });
      this.renderer.render(this.scene, this.camera);
    };
    requestAnimationFrame(loop);
  }

  hide() {
    this.visible = false;
  }

  set(patch) {
    // Lo bloqueado no se aplica: un solo cambio avisa (ir a la tienda); en «aleatorio» simplemente se omite.
    const keys = Object.keys(patch);
    for (const k of keys) {
      if (!this.locked(k, patch[k])) continue;
      if (keys.length === 1) { this.onLocked(k, patch[k]); return; }
      delete patch[k];
    }
    this.skin = sanitizeSkin({ ...this.skin, ...patch });
    this.avatar?.setSkin(this.skin);
    this.syncControls();
    this.onChange(this.skin);
  }

  buildControls() {
    const $ = (id) => document.getElementById(id);
    const swatches = (el, list, key) => {
      el.replaceChildren(...list.map((c) => {
        const b = document.createElement('button');
        b.className = 'swatch';
        b.style.background = c;
        b.title = c;
        b.setAttribute('aria-label', c);
        b.dataset.value = c;
        b.addEventListener('click', () => this.set({ [key]: c }));
        return b;
      }));
    };
    const chips = (el, list, key) => {
      el.replaceChildren(...list.map((label, i) => {
        const b = document.createElement('button');
        b.className = 'chip';
        b.textContent = label;
        b.dataset.value = String(i);
        b.addEventListener('click', () => this.set({ [key]: i }));
        return b;
      }));
    };
    swatches($('sw-p'), PRIMARY, 'p');
    swatches($('sw-s'), SECONDARY, 's');
    swatches($('sw-v'), VISORS, 'v');
    chips($('ch-m'), MODELS, 'm');
    chips($('ch-h'), HELMETS, 'h');
    chips($('ch-t'), PATTERNS, 't');
    $('btn-skin-random').addEventListener('click', () => this.set(randomSkin()));
  }

  syncControls() {
    const mark = (id, value, key) => {
      for (const b of document.getElementById(id).children) {
        b.classList.toggle('selected', b.dataset.value === String(value));
        if (!key) continue;
        const price = this.locked(key, Number(b.dataset.value));
        b.classList.toggle('locked', price !== 0);
        if (price !== 0) b.dataset.price = price < 0 ? '🔒 CAJAS' : `🔒 ${price}`; else delete b.dataset.price;
      }
    };
    mark('sw-p', this.skin.p);
    mark('sw-s', this.skin.s);
    mark('sw-v', this.skin.v);
    mark('ch-h', this.skin.h, 'h');
    mark('ch-t', this.skin.t, 't');
    mark('ch-m', this.skin.m, 'm');
    document.getElementById('model-note').textContent = MODEL_NOTE[this.skin.m] ?? '';
  }
}
