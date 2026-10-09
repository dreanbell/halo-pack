import * as THREE from 'three';
import { GLTFLoader } from '../vendor/three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from '../vendor/three/addons/utils/SkeletonUtils.js';

// Skins 3D del soldado: modelos CC0 (vendor/assets/players, ver ATTRIBUTION.md) que copian la pose del
// esqueleto procedural de avatar.js. El esqueleto procedural sigue animando (andar, agacharse, deslizarse,
// morir), lleva el arma y las hitboxes; aquí solo se viste: la cadera del modelo va a la cadera del avatar,
// el torso y la cabeza copian su orientación y brazos y piernas usan IK de dos huesos con sus propias
// longitudes (manos en las empuñaduras del arma y pies donde pisa el avatar).

const DIR = new URL('../vendor/assets/players/', import.meta.url).href;
const PI = Math.PI;
const UP = new THREE.Vector3(0, 1, 0);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();

const SCIFI = {
  file: 'scifi', rotY: PI, heads: ['Head1', 'Head2', 'Head3'],
  hips: 'hips', spine: ['spine', 'chest'], head: ['neck', 'head'],
  arms: [['upper_armL', 'forearmL', 'handL'], ['upper_armR', 'forearmR', 'handR']],
  legs: [['thighL', 'shinL', 'footL'], ['thighR', 'shinR', 'footR']],
};
const COMMANDO = {
  rotY: PI, tex: 'commando.png', pixel: true,
  hips: 'ABD', spine: ['RIBS'], head: ['HEAD'],
  arms: [['UAL', 'LAL', 'HANDL'], ['UAR', 'LAR', 'HANDR']],
  legs: [['THIGHL', 'CALFL', 'FOOTL'], ['THIGHR', 'CALFR', 'FOOTR']],
};
// Índice = skin.m (0 es el soldado procedural).
const DEFS = [
  null,
  { ...SCIFI, look: 'federal' },
  { ...SCIFI, look: 'military' },
  { ...SCIFI, look: 'evil' },
  {
    file: 'exo', rotY: PI / 2, armor: true,
    hips: 'pelvis', spine: ['l_torso', 'u_torso'], head: [],
    arms: [['l_arm_1', 'l_forearm', 'l_hand'], ['r_arm_1', 'r_forearm', 'r_hand']],
    legs: [['l_leg_1', 'l_leg_2', 'l_foot'], ['r_leg_1', 'r_leg_2', 'r_foot']],
  },
  { ...COMMANDO, file: 'commando' },
  { ...COMMANDO, file: 'commando_f' },
];

const models = new Map();
const textures = new Map();
let loading = null;

function tex(name, srgb = true) {
  if (textures.has(name)) return textures.get(name);
  const t = new THREE.TextureLoader().load(DIR + name);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = false; // UV de glTF
  t.anisotropy = 4;
  textures.set(name, t);
  return t;
}

export function loadPlayerModels() {
  if (loading) return loading;
  const loader = new GLTFLoader();
  const files = [...new Set(DEFS.filter(Boolean).map((d) => d.file))];
  loading = Promise.all(files.map(async (f) => {
    try {
      models.set(f, await loader.loadAsync(`${DIR}${f}.glb`));
    } catch (e) {
      console.warn(`Ringfall: no se pudo cargar la skin ${f}`, e);
    }
  }));
  return loading;
}

export const hasPlayerModel = (m) => !!DEFS[m] && models.has(DEFS[m].file);

// Gira un hueso para que su eje +Y apunte en la dirección dada (en mundo), conservando su giro propio.
function aim(bone, dir) {
  bone.parent.getWorldQuaternion(_q);
  _q2.multiplyQuaternions(_q, bone.quaternion);
  _a.copy(UP).applyQuaternion(_q2);
  _q3.setFromUnitVectors(_a, _b.copy(dir).normalize());
  _q2.premultiply(_q3);
  bone.quaternion.copy(_q.invert()).multiply(_q2);
  bone.updateMatrixWorld(true);
}

export class PlayerModel {
  constructor(avatar, m) {
    const def = (this.def = DEFS[m]);
    const gltf = models.get(def.file);
    this.avatar = avatar;
    this.m = m;
    const model = (this.model = cloneSkinned(gltf.scene));
    this.bones = new Map();
    model.traverse((o) => {
      if (o.isBone) this.bones.set(o.name, o);
      if (o.isMesh) {
        o.castShadow = o.receiveShadow = true;
        o.frustumCulled = false;
      }
    });
    this.meshes = [];
    model.traverse((o) => { if (o.isMesh) this.meshes.push(o); });
    this.applySkin(avatar.skin);

    // Encaje: mirando a -Z como el avatar y con la cadera a la altura de la del avatar.
    this.wrap = new THREE.Group();
    this.spin = new THREE.Group();
    this.spin.rotation.y = def.rotY;
    this.spin.add(model);
    this.wrap.add(this.spin);
    this.wrap.updateMatrixWorld(true); // se mide suelto, sin la posición del jugador
    const box = new THREE.Box3();
    for (const o of this.meshes) if (o.visible) box.expandByObject(o, true);
    const hips = this.bones.get(def.hips);
    const hipY = hips.getWorldPosition(_a).y, floor = box.min.y;
    const k = avatar.hipY / Math.max(0.01, hipY - floor);
    this.wrap.scale.setScalar(k);
    const ctr = box.getCenter(_b);
    this.wrap.position.set(-ctr.x * k, -floor * k, -ctr.z * k); // centrado (algunos modelos no están en el origen)
    avatar.body.add(this.wrap);
    avatar.root.updateMatrixWorld(true);

    // Reposo de cada hueso usado y longitudes de brazos y piernas (ya escaladas).
    this.rest = new Map();
    const chain = (names) => names.map((n) => this.bones.get(n)).filter(Boolean);
    const all = [def.hips, ...def.spine, ...def.head, ...def.arms.flat(), ...def.legs.flat()];
    for (const n of all) { const b = this.bones.get(n); if (b) this.rest.set(b, { q: b.quaternion.clone(), p: b.position.clone() }); }
    this.spine = chain(def.spine);
    this.head = chain(def.head).filter((b) => { b.getWorldQuaternion(_q); return _a.copy(UP).applyQuaternion(_q).y > 0.6; });
    const limb = (names) => {
      const [u, l, e] = chain(names);
      if (!u || !l || !e) return null;
      return { u, l, e, a: u.getWorldPosition(_a).distanceTo(l.getWorldPosition(_b)), b: _b.distanceTo(e.getWorldPosition(_c)) };
    };
    // El lado se decide por la posición real (algunos modelos nombran L/R al revés): +X del cuerpo = derecha.
    const hx = avatar.body.worldToLocal(hips.getWorldPosition(_b)).x;
    const side = (lb) => (lb && avatar.body.worldToLocal(lb.u.getWorldPosition(_a)).x > hx ? 1 : -1);
    this.arms = {}; this.legs = {};
    for (const n of def.arms) { const lb = limb(n); if (lb) this.arms[side(lb)] = lb; }
    for (const n of def.legs) { const lb = limb(n); if (lb) this.legs[side(lb)] = lb; }
    this.hips = hips;
  }

  applySkin(skin) {
    const def = this.def;
    if (def.heads) for (const o of this.meshes) if (def.heads.includes(o.name)) o.visible = o.name === def.heads[skin.h];
    let mat;
    if (def.look) {
      mat = new THREE.MeshStandardMaterial({
        map: tex(`scifi_${def.look}.jpg`), normalMap: tex('scifi_normal.jpg', false), emissiveMap: tex(`scifi_${def.look}_glow.png`),
        emissive: new THREE.Color(skin.v), emissiveIntensity: 1.6, metalness: 0.55, roughness: 0.42,
      });
    } else if (def.armor) {
      mat = this.avatar.m.armor; // pintura procedural con los colores y el patrón de la armadura
    } else {
      const t = tex(def.tex);
      if (def.pixel) { t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.minFilter = THREE.NearestFilter; }
      mat = new THREE.MeshStandardMaterial({ map: t, color: new THREE.Color(0xffffff).lerp(new THREE.Color(skin.p), 0.45), metalness: 0.3, roughness: 0.6 });
    }
    if (this.mat && this.mat !== this.avatar.m.armor) this.mat.dispose();
    this.mat = mat;
    for (const o of this.meshes) o.material = mat;
  }

  // IK de dos huesos hacia `target` con el codo/rodilla hacia `pole` (posiciones en mundo).
  limb(L, target, pole) {
    const S = L.u.getWorldPosition(_c);
    _d.subVectors(target, S);
    const ws = this.wrap.getWorldScale(_e).x / this.wrap.scale.x; // escala del avatar (no la del encaje)
    const a = L.a * ws, b = L.b * ws;
    const dist = Math.min(Math.max(_d.length(), 0.02), a + b - 0.002);
    _d.normalize();
    const cosA = (a * a + dist * dist - b * b) / (2 * a * dist), sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    _e.subVectors(pole, S);
    _e.addScaledVector(_d, -_e.dot(_d)).normalize();
    const start = S.clone();
    const elbow = start.clone().addScaledVector(_d, cosA * a).addScaledVector(_e, sinA * a);
    const end = start.clone().addScaledVector(_d, dist);
    aim(L.u, elbow.clone().sub(start));
    aim(L.l, end.sub(L.l.getWorldPosition(_c)));
  }

  update() {
    const av = this.avatar;
    for (const [b, r] of this.rest) { b.quaternion.copy(r.q); b.position.copy(r.p); }
    av.root.updateMatrixWorld(true);
    // Cadera a la cadera del avatar (agacharse, deslizarse, caer).
    const hp = av.hips.getWorldPosition(new THREE.Vector3());
    this.hips.parent.worldToLocal(hp);
    this.hips.position.copy(hp);
    this.hips.updateMatrixWorld(true);
    // Torso y cabeza: misma inclinación que el avatar.
    av.spine.getWorldQuaternion(_q);
    const up = _a.copy(UP).applyQuaternion(_q).clone();
    for (const b of this.spine) aim(b, up);
    if (this.head.length) {
      av.head.getWorldQuaternion(_q);
      const hu = _a.copy(UP).applyQuaternion(_q).clone();
      for (const b of this.head) aim(b, hu);
    }
    // Brazos: manos al final del brazo del avatar (sus empuñaduras), codos hacia el mismo lado.
    for (const side of [-1, 1]) {
      const A = this.arms[side], arm = av.arms[side];
      if (!A || !arm) continue;
      const hand = arm.el.localToWorld(new THREE.Vector3(0, -av.lowerArm, 0));
      const pole = arm.el.getWorldPosition(new THREE.Vector3()).sub(arm.sh.getWorldPosition(_a)).multiplyScalar(2).add(_a);
      this.limb(A, hand, pole);
    }
    // Piernas: tobillo al del avatar, rodilla hacia delante.
    for (const side of [-1, 1]) {
      const Lg = this.legs[side], leg = av.legs[side];
      if (!Lg || !leg) continue;
      const ankle = leg.ankle.getWorldPosition(new THREE.Vector3());
      const pole = leg.knee.getWorldPosition(new THREE.Vector3());
      leg.knee.localToWorld(_b.set(0, 0, -0.6));
      pole.copy(_b);
      this.limb(Lg, ankle, pole);
    }
  }

  dispose() {
    this.wrap.parent?.remove(this.wrap);
    if (this.mat && this.mat !== this.avatar.m.armor) this.mat.dispose();
  }
}
