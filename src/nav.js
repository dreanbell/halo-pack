import { CFG, clamp } from './config.js';

// Rejilla 2.5D (celdas de 1 m) + campo de flujo (Dijkstra) hacia el jugador.
// Todos los enemigos comparten el mismo campo; se recalcula al cambiar de celda el jugador.
const CLEAR = 0.6;          // holgura mínima a obstáculos
const BODY = 1.8;           // altura libre necesaria
const SEED_R = 2;           // radio (celdas) de objetivo alrededor del jugador
const OFF_LEVEL_COST = 150; // penaliza celdas objetivo a distinta altura (p. ej. bajo una plataforma)
const NB = [[1, 0, 10], [-1, 0, 10], [0, 1, 10], [0, -1, 10], [1, 1, 14], [1, -1, 14], [-1, 1, 14], [-1, -1, 14]];
const NB_DI = NB.map((n) => n[0]), NB_DJ = NB.map((n) => n[1]), NB_C = NB.map((n) => n[2]);

export class NavGrid {
  constructor(world) {
    const H = CFG.arena.half, step = CFG.player.step;
    this.H = H;
    this.step = step;
    const N = (this.N = Math.ceil(H * 2));
    this.h = new Float32Array(N * N);
    this.ok = new Uint8Array(N * N);
    this.dist = new Float32Array(N * N).fill(Infinity);
    this.heap = new Int32Array(N * N * 8);
    this.heapD = new Float32Array(N * N * 8);
    this.target = '';
    this.timer = 0;

    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const x = -H + i + 0.5, z = -H + j + 0.5;
        let h = 0;
        for (const b of world.colliders) {
          if (x >= b.min.x && x <= b.max.x && z >= b.min.z && z <= b.max.z && b.max.y > h) h = b.max.y;
        }
        let ok = 1;
        for (const b of world.colliders) {
          if (b.max.y <= h + step || b.min.y >= h + BODY) continue;
          const dx = x - clamp(x, b.min.x, b.max.x), dz = z - clamp(z, b.min.z, b.max.z);
          if (dx * dx + dz * dz < CLEAR * CLEAR) { ok = 0; break; }
        }
        this.h[j * N + i] = h;
        this.ok[j * N + i] = ok;
      }
    }
  }

  index(x, z) {
    const N = this.N;
    const i = clamp(Math.floor(x + this.H), 0, N - 1), j = clamp(Math.floor(z + this.H), 0, N - 1);
    return j * N + i;
  }

  // ¿Se puede ir de la celda a a la b (vecinas)? Subir como máximo `step`, bajar libre.
  canMove(a, b, di, dj) {
    const { ok, h, N } = this;
    if (!ok[a] || !ok[b] || h[b] - h[a] > this.step) return false;
    if (di && dj) {
      const c1 = a + di, c2 = a + dj * N;
      if (!ok[c1] || !ok[c2] || h[c1] - h[a] > this.step || h[c2] - h[a] > this.step) return false;
    }
    return true;
  }

  // targets: [{ pos, ... }] — el campo lleva hacia el objetivo vivo más cercano.
  update(targets, dt) {
    this.timer -= dt;
    const key = targets.map((t) => this.index(t.pos.x, t.pos.z)).join(',');
    if (key === this.target || this.timer > 0) return;
    this.target = key;
    this.timer = 0.25;
    this.compute(targets.map((t) => [this.index(t.pos.x, t.pos.z), t.pos.y]));
  }

  compute(seeds) {
    const { N, h, ok, dist, heap, heapD } = this;
    dist.fill(Infinity);
    let size = 0;
    // Montículo binario de pares (celda, coste); las entradas obsoletas se descartan al sacarlas.
    const push = (idx, d) => {
      let k = size++;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (heapD[p] <= d) break;
        heap[k] = heap[p]; heapD[k] = heapD[p]; k = p;
      }
      heap[k] = idx; heapD[k] = d;
    };
    const pop = () => {
      const top = heap[0], topD = heapD[0];
      const li = heap[--size], ld = heapD[size];
      let k = 0;
      for (;;) {
        const l = 2 * k + 1, r = l + 1;
        let m = -1, md = ld;
        if (l < size && heapD[l] < md) { m = l; md = heapD[l]; }
        if (r < size && heapD[r] < md) { m = r; md = heapD[r]; }
        if (m < 0) break;
        heap[k] = heap[m]; heapD[k] = heapD[m]; k = m;
      }
      heap[k] = li; heapD[k] = ld;
      this.popD = topD;
      return top;
    };

    for (const [t, feetY] of seeds) {
      const ti = t % N, tj = (t / N) | 0;
      for (let dj = -SEED_R; dj <= SEED_R; dj++) {
        for (let di = -SEED_R; di <= SEED_R; di++) {
          const i = ti + di, j = tj + dj;
          if (i < 0 || j < 0 || i >= N || j >= N || di * di + dj * dj > SEED_R * SEED_R) continue;
          const idx = j * N + i;
          if (!ok[idx]) continue;
          const d = (Math.abs(h[idx] - feetY) <= this.step + 0.1 ? 0 : OFF_LEVEL_COST) + Math.hypot(di, dj) * 10;
          if (d < dist[idx]) { dist[idx] = d; push(idx, d); }
        }
      }
    }
    // Expansión inversa: el enemigo en `v` puede moverse a `u`.
    while (size > 0) {
      const u = pop();
      if (this.popD > dist[u]) continue;
      const du = dist[u], ui = u % N, uj = (u / N) | 0;
      for (let k = 0; k < 8; k++) {
        const di = NB_DI[k], dj = NB_DJ[k];
        const vi = ui + di, vj = uj + dj;
        if (vi < 0 || vj < 0 || vi >= N || vj >= N) continue;
        const v = vj * N + vi;
        const nd = du + NB_C[k];
        if (nd >= dist[v] || !this.canMove(v, u, -di, -dj)) continue;
        dist[v] = nd;
        if (size < heap.length) push(v, nd);
      }
    }
  }

  // Dirección (x, z normalizada) hacia la siguiente celda del camino, o null si no hay ruta.
  flowDir(pos, out) {
    const { N, dist } = this;
    const c = this.index(pos.x, pos.z), ci = c % N, cj = (c / N) | 0;
    let best = -1, bestD = dist[c];
    for (const [di, dj] of NB) {
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= N || j >= N) continue;
      const n = j * N + i;
      // Desde una celda bloqueada (pegado a un muro) basta con salir a cualquier celda con ruta.
      if (dist[n] < bestD && (!Number.isFinite(dist[c]) || this.canMove(c, n, di, dj))) { best = n; bestD = dist[n]; }
    }
    if (best < 0) return null;
    const x = -this.H + (best % N) + 0.5 - pos.x, z = -this.H + ((best / N) | 0) + 0.5 - pos.z;
    const l = Math.hypot(x, z) || 1;
    out.x = x / l;
    out.z = z / l;
    return out;
  }
}
