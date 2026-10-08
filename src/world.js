import * as THREE from 'three';
import { CFG, clamp } from './config.js';

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function noiseFill(g, w, h, base, amount) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  const img = g.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 255 * amount;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

export function glowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  return canvasTex(64, 64, (g, w) => {
    const grd = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    grd.addColorStop(0, inner); grd.addColorStop(1, outer);
    g.fillStyle = grd; g.fillRect(0, 0, w, w);
  });
}

// Mapa de entorno (reflejos del cielo) para metales y visores.
export function skyEnvironment(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const s = new THREE.Scene();
  const geo = new THREE.SphereGeometry(10, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      top: { value: new THREE.Color(0x3a74c0) },
      bottom: { value: new THREE.Color(0xdfeaf2) },
      ground: { value: new THREE.Color(0x4a5840) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 ground; varying vec3 vP;
      void main(){ float h = vP.y;
        vec3 c = h > 0.0 ? mix(bottom, top, clamp(h * 1.6, 0.0, 1.0)) : mix(bottom * 0.7, ground, clamp(-h * 5.0, 0.0, 1.0));
        gl_FragColor = vec4(c, 1.0); }`,
  });
  s.add(new THREE.Mesh(geo, mat));
  const sunGeo = new THREE.SphereGeometry(0.7, 16, 8);
  const sunMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.95, 0.85).multiplyScalar(25) });
  const sun = new THREE.Mesh(sunGeo, sunMat);
  sun.position.set(40, 90, 25).normalize().multiplyScalar(9);
  s.add(sun);
  const tex = pmrem.fromScene(s, 0.02).texture;
  pmrem.dispose();
  geo.dispose(); mat.dispose(); sunGeo.dispose(); sunMat.dispose();
  return tex;
}

export function createWorld(scene) {
  const H = CFG.arena.half;
  const STEP = CFG.player.step;
  const rng = mulberry32(1337);
  const colliders = [];
  const solids = [];

  // --- Cielo, niebla, luces -------------------------------------------------
  scene.fog = new THREE.Fog(0xa9c4dc, 80, 650);
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1500, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { top: { value: new THREE.Color(0x2a64ad) }, bottom: { value: new THREE.Color(0xcfe3f2) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float t = clamp(vP.y * 1.6 + 0.08, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, t), 1.0); }',
    }),
  );
  sky.renderOrder = -2;
  scene.add(sky);

  const sunDir = new THREE.Vector3(40, 90, 25).normalize();
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('rgba(255,250,230,1)', 'rgba(255,220,160,0)'),
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  sunSprite.position.copy(sunDir).multiplyScalar(1300);
  sunSprite.scale.setScalar(260);
  sunSprite.renderOrder = -1;
  scene.add(sunSprite);

  // El anillo: banda gigante que cruza el cielo.
  const ringTex = canvasTex(1024, 64, (g, w, h) => {
    g.fillStyle = '#6f8f5a'; g.fillRect(0, 0, w, h);
    const cols = ['#58784a', '#8aa070', '#a89c78', '#4f7896', '#d8e2e6', '#3f6a8c'];
    for (let i = 0; i < 500; i++) {
      g.fillStyle = cols[(Math.random() * cols.length) | 0];
      g.beginPath();
      g.ellipse(Math.random() * w, 8 + Math.random() * (h - 16), 4 + Math.random() * 28, 2 + Math.random() * 8, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#39424e'; g.fillRect(0, 0, w, 7); g.fillRect(0, h - 7, w, 7);
    g.fillStyle = '#9fb3c4'; g.fillRect(0, 7, w, 2); g.fillRect(0, h - 9, w, 2);
  });
  ringTex.repeat.set(10, 1);
  const ring = new THREE.Mesh(
    new THREE.CylinderGeometry(1000, 1000, 110, 256, 1, true),
    new THREE.MeshBasicMaterial({ map: ringTex, side: THREE.DoubleSide, fog: false, color: 0xd6e4f5, depthWrite: false }),
  );
  ring.rotation.z = Math.PI / 2;
  ring.position.set(420, 880, -120);
  ring.renderOrder = -1;
  scene.add(ring);

  scene.add(new THREE.HemisphereLight(0xd6eaff, 0x4a5a3a, 0.6));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
  sun.position.copy(sunDir).multiplyScalar(110);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -72, right: 72, top: 72, bottom: -72, near: 1, far: 300 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  // --- Terreno --------------------------------------------------------------
  const groundTex = canvasTex(512, 512, (g, w, h) => {
    noiseFill(g, w, h, '#5f7448', 0.16);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(${40 + Math.random() * 60},${60 + Math.random() * 50},${30 + Math.random() * 30},0.35)`;
      g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 3 + Math.random() * 18, 0, Math.PI * 2); g.fill();
    }
  });
  groundTex.repeat.set(26, 26);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(H * 2 + 40, H * 2 + 40),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  solids.push(ground);

  const outer = new THREE.Mesh(new THREE.CircleGeometry(1400, 64), new THREE.MeshStandardMaterial({ color: 0x566a43, roughness: 1 }));
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = -0.05;
  scene.add(outer);

  // Montañas lejanas y bosque fuera de la arena (decorativo, sin colisión).
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x6c7a62, roughness: 1, flatShading: true });
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + rng() * 0.3;
    const r = 320 + rng() * 280, s = 50 + rng() * 70;
    const hill = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), hillMat);
    hill.scale.set(s * 1.6, s * (0.5 + rng() * 0.5), s * 1.3);
    hill.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    hill.rotation.y = rng() * 6;
    scene.add(hill);
  }
  const TREES = 90;
  const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(2.4, 8, 7), new THREE.MeshStandardMaterial({ color: 0x2f4a2c, roughness: 0.9, flatShading: true }), TREES);
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.35, 0.45, 3, 6), new THREE.MeshStandardMaterial({ color: 0x4a3a2a }), TREES);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i < TREES; i++) {
    const a = rng() * Math.PI * 2, r = 72 + rng() * 150, s = 0.8 + rng() * 0.9;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    sc.set(s, s, s);
    crowns.setMatrixAt(i, m.compose(p.set(x, 3 * s + 4 * s, z), q, sc));
    trunks.setMatrixAt(i, m.compose(p.set(x, 1.5 * s, z), q, sc));
  }
  crowns.castShadow = true;
  scene.add(crowns, trunks);

  // --- Estructuras ----------------------------------------------------------
  const metalTex = canvasTex(256, 256, (g, w, h) => {
    noiseFill(g, w, h, '#8a95a3', 0.06);
    g.strokeStyle = 'rgba(30,40,55,0.55)'; g.lineWidth = 3;
    g.strokeRect(2, 2, w - 4, h - 4);
    g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
  });
  const crateTex = canvasTex(128, 128, (g, w, h) => {
    noiseFill(g, w, h, '#5b6650', 0.1);
    g.strokeStyle = '#2f3529'; g.lineWidth = 8; g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = '#d9b44a'; g.fillRect(14, 14, 28, 8);
  });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0x5fe1ff });

  const texCache = new Map();
  function material(kind, w, h, d) {
    const base = kind === 'crate' ? crateTex : metalTex;
    const unit = kind === 'crate' ? 1.4 : 4;
    const rx = Math.max(1, Math.round(Math.max(w, d) / unit)), ry = Math.max(1, Math.round(h / unit));
    const key = `${kind}:${rx}:${ry}`;
    if (!texCache.has(key)) {
      const t = base.clone();
      t.repeat.set(rx, ry);
      t.needsUpdate = true;
      texCache.set(key, new THREE.MeshStandardMaterial({
        map: t, roughness: kind === 'crate' ? 0.8 : 0.5, metalness: kind === 'crate' ? 0.1 : 0.3,
        color: kind === 'dark' ? 0x8a96a6 : 0xffffff,
      }));
    }
    return texCache.get(key);
  }

  function addBox(x, y, z, w, h, d, kind = 'metal') {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material(kind, w, h, d));
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
    solids.push(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    return mesh;
  }

  function addStrip(x, y, z, w, h, d) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), glowMat);
    s.position.set(x, y, z);
    scene.add(s);
  }

  // Muros perimetrales.
  const WALL_H = 7;
  for (const sgn of [-1, 1]) {
    addBox(0, 0, sgn * (H + 1), H * 2 + 4, WALL_H, 2, 'dark');
    addBox(sgn * (H + 1), 0, 0, 2, WALL_H, H * 2 + 4, 'dark');
    addStrip(0, WALL_H - 0.6, sgn * (H - 0.02), H * 2, 0.12, 0.05);
    addStrip(sgn * (H - 0.02), WALL_H - 0.6, 0, 0.05, 0.12, H * 2);
  }

  // Plataforma central con escaleras, parapetos y pilares.
  const PH = 2.4;
  addBox(0, 0, 0, 14, PH, 14);
  for (const sgn of [-1, 1]) {
    for (let i = 1; i <= 5; i++) addBox(0, 0, sgn * (7 + (5 - i) + 0.5), 4, 0.45 * i, 1);
    addBox(-4.5, PH, sgn * 6.7, 5, 0.9, 0.6);
    addBox(4.5, PH, sgn * 6.7, 5, 0.9, 0.6);
    addBox(sgn * 6.7, PH, 0, 0.6, 0.9, 12.8);
    addStrip(sgn * 7.02, PH - 0.3, 0, 0.05, 0.1, 14);
  }
  for (const [x, z] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) {
    addBox(x * 0.92, PH + 0.9, z * 0.92, 0.9, 3.4, 0.9);
    addStrip(x * 0.92, PH + 4.3, z * 0.92, 0.95, 0.12, 0.95);
  }

  // Búnkeres en L en las esquinas.
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = sx * 34, z = sz * 34;
    addBox(x, 0, z, 9, 3.2, 1.2);
    addBox(x + sx * 3.9, 0, z - sz * 3.6, 1.2, 3.2, 6);
    addStrip(x, 3.25, z, 9, 0.1, 1.25);
  }

  // Pilares altos.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    const x = Math.cos(a) * 22, z = Math.sin(a) * 22;
    addBox(x, 0, z, 2, 8, 2, 'dark');
    addStrip(x, 7.2, z, 2.05, 0.15, 2.05);
  }

  // Cajas dispersas (posiciones deterministas).
  const placed = colliders.map((b) => b.clone().expandByScalar(1.5));
  const tmpBox = new THREE.Box3();
  let crates = 0, tries = 0;
  while (crates < 26 && tries++ < 600) {
    const a = rng() * Math.PI * 2, r = 12 + rng() * 42;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.hypot(x, z - 30) < 5) continue;
    const w = 1.4 + rng() * 1.0, d = 1.4 + rng() * 1.0, h = 1.2 + rng() * 0.4;
    tmpBox.min.set(x - w / 2 - 1.2, 0, z - d / 2 - 1.2);
    tmpBox.max.set(x + w / 2 + 1.2, 10, z + d / 2 + 1.2);
    if (Math.abs(x) > H - 3 || Math.abs(z) > H - 3 || placed.some((b) => b.intersectsBox(tmpBox))) continue;
    addBox(x, 0, z, w, h, d, 'crate');
    if (rng() < 0.3) addBox(x + (rng() - 0.5) * 0.3, h, z + (rng() - 0.5) * 0.3, w * 0.8, 1.1, d * 0.8, 'crate');
    placed.push(tmpBox.clone());
    crates++;
  }

  // Rocas (colisión aproximada con AABB reducida).
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x7d7b70, roughness: 0.95, flatShading: true });
  let rocks = 0; tries = 0;
  while (rocks < 10 && tries++ < 300) {
    const x = (rng() * 2 - 1) * (H - 6), z = (rng() * 2 - 1) * (H - 6);
    const s = 1.2 + rng() * 1.3;
    tmpBox.min.set(x - s - 1, 0, z - s - 1); tmpBox.max.set(x + s + 1, 10, z + s + 1);
    if (Math.hypot(x, z - 30) < 6 || placed.some((b) => b.intersectsBox(tmpBox))) continue;
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockMat);
    rock.scale.y = 0.65;
    rock.position.set(x, s * 0.35, z);
    rock.rotation.y = rng() * 6;
    rock.castShadow = rock.receiveShadow = true;
    scene.add(rock);
    solids.push(rock);
    const box = new THREE.Box3().setFromObject(rock);
    box.min.x += s * 0.25; box.max.x -= s * 0.25; box.min.z += s * 0.25; box.max.z -= s * 0.25; box.max.y -= s * 0.1;
    colliders.push(box);
    placed.push(tmpBox.clone());
    rocks++;
  }

  // --- API de colisiones ----------------------------------------------------
  function groundHeightAt(x, z, r, feetY, step = STEP) {
    let h = 0;
    for (const b of colliders) {
      if (x + r <= b.min.x || x - r >= b.max.x || z + r <= b.min.z || z - r >= b.max.z) continue;
      if (b.max.y <= feetY + step && b.max.y > h) h = b.max.y;
    }
    return h;
  }

  // Empuja un círculo (plano XZ) fuera de las cajas que interseca en altura.
  function resolveHorizontal(pos, r, feetY, headY, step = STEP) {
    let hit = false;
    for (const b of colliders) {
      if (b.max.y <= feetY + step || b.min.y >= headY) continue;
      const cx = clamp(pos.x, b.min.x, b.max.x), cz = clamp(pos.z, b.min.z, b.max.z);
      const dx = pos.x - cx, dz = pos.z - cz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      hit = true;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        pos.x += (dx / d) * (r - d); pos.z += (dz / d) * (r - d);
      } else {
        const pen = [pos.x - b.min.x, b.max.x - pos.x, pos.z - b.min.z, b.max.z - pos.z];
        const i = pen.indexOf(Math.min(...pen));
        if (i === 0) pos.x = b.min.x - r; else if (i === 1) pos.x = b.max.x + r;
        else if (i === 2) pos.z = b.min.z - r; else pos.z = b.max.z + r;
      }
    }
    return hit;
  }

  function clampToArena(pos, r) {
    const L = H - r;
    pos.x = clamp(pos.x, -L, L);
    pos.z = clamp(pos.z, -L, L);
  }

  const ray = new THREE.Raycaster(), dir = new THREE.Vector3();
  function lineOfSight(a, b) {
    dir.subVectors(b, a);
    const d = dir.length();
    if (d < 1e-3) return true;
    ray.set(a, dir.divideScalar(d));
    ray.far = d - 0.2;
    return ray.intersectObjects(solids, false).length === 0;
  }

  function pointInSolid(p) {
    if (p.y <= 0) return true;
    for (const b of colliders) if (b.containsPoint(p)) return true;
    return false;
  }

  // Puntos de aparición junto a los muros, fuera de obstáculos.
  const spawnPoints = [];
  const probe = new THREE.Vector3();
  for (let t = -45; t <= 45; t += 9) {
    for (const [x, z] of [[t, -52], [t, 52], [-52, t], [52, t]]) {
      probe.set(x, 0.5, z);
      const free = !colliders.some((b) => b.clone().expandByScalar(1.2).containsPoint(probe));
      if (free) spawnPoints.push(new THREE.Vector3(x, 0, z));
    }
  }

  return { colliders, solids, spawnPoints, groundHeightAt, resolveHorizontal, clampToArena, lineOfSight, pointInSolid };
}
