import * as THREE from 'three';
import { Q } from './quality.js';
import { S } from './settings.js';

// Postprocesado propio y ligero (sin EffectComposer): la escena se pinta en HDR a una textura y un último pase
// aplica bloom (resplandor de fogonazos, explosiones, visores y brillos), corrección de color, viñeta, tone mapping
// y sRGB. El bloom se calcula a 1/4 y 1/8 de resolución (barato). Por defecto solo en calidad ALTA (Ajustes →
// Gráficos → Postprocesado); en MEDIA/BAJA se pinta como siempre, sin coste extra.
const VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const BRIGHT = `
uniform sampler2D tMap; uniform float threshold; varying vec2 vUv;
void main() {
  vec3 c = texture2D(tMap, vUv).rgb;
  float l = max(c.r, max(c.g, c.b));
  float k = smoothstep(threshold, threshold + 0.6, l);
  gl_FragColor = vec4(c * k, 1.0);
}`;

const BLUR = `
uniform sampler2D tMap; uniform vec2 dir; varying vec2 vUv;
void main() {
  vec3 c = texture2D(tMap, vUv).rgb * 0.2270270270;
  c += (texture2D(tMap, vUv + dir * 1.3846153846).rgb + texture2D(tMap, vUv - dir * 1.3846153846).rgb) * 0.3162162162;
  c += (texture2D(tMap, vUv + dir * 3.2307692308).rgb + texture2D(tMap, vUv - dir * 3.2307692308).rgb) * 0.0702702703;
  gl_FragColor = vec4(c, 1.0);
}`;

const FINAL = `
uniform sampler2D tScene, tBloomA, tBloomB; uniform float bloom, vignette, sat, contrast; uniform vec3 tint;
varying vec2 vUv;
void main() {
  vec3 col = texture2D(tScene, vUv).rgb;
  col += (texture2D(tBloomA, vUv).rgb * 0.7 + texture2D(tBloomB, vUv).rgb * 0.9) * bloom;
  #ifdef TONE_MAPPING
  col = toneMapping(col);
  #endif
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(l), col, sat) * tint;
  col = 0.18 * pow(max(col, vec3(0.0)) / 0.18, vec3(contrast));
  float d = length((vUv - 0.5) * vec2(1.15, 1.0));
  col *= 1.0 - vignette * smoothstep(0.38, 0.92, d);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}`;

export class Post {
  constructor(renderer) {
    this.r = renderer;
    this.size = new THREE.Vector2();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.quad.frustumCulled = false;
    this.scene = new THREE.Scene();
    this.scene.add(this.quad);
    const mat = (frag, uniforms, toneMapped = false) => new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, toneMapped });
    this.bright = mat(BRIGHT, { tMap: { value: null }, threshold: { value: 1.15 } });
    this.blur = mat(BLUR, { tMap: { value: null }, dir: { value: new THREE.Vector2() } });
    this.final = mat(FINAL, {
      tScene: { value: null }, tBloomA: { value: null }, tBloomB: { value: null },
      bloom: { value: 0.55 }, vignette: { value: 0.32 }, sat: { value: 1.1 }, contrast: { value: 1.06 }, tint: { value: new THREE.Color(1, 1, 1) },
    }, true);
    this.rt = null;
  }

  get enabled() {
    return S.post === 'on' || (S.post === 'auto' && Q.level === 'alta');
  }

  // Tono por mapa (world.grade: { sat, contrast, tint, bloom, vignette }).
  setGrade(g = {}) {
    const u = this.final.uniforms;
    u.sat.value = g.sat ?? 1.1;
    u.contrast.value = g.contrast ?? 1.06;
    u.tint.value.set(g.tint ?? 0xffffff);
    u.bloom.value = g.bloom ?? 0.55;
    u.vignette.value = g.vignette ?? 0.32;
  }

  resize() {
    const r = this.r, s = r.getDrawingBufferSize(this.size), w = Math.max(1, s.x), h = Math.max(1, s.y);
    const aa = Q.aa ? 4 : 0;
    if (this.rt && this.rt.width === w && this.rt.height === h && this.rt.samples === aa) return;
    this.dispose();
    const opt = { type: THREE.HalfFloatType, depthBuffer: false };
    this.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: aa });
    const q = (k) => new THREE.WebGLRenderTarget(Math.max(1, Math.round(w / k)), Math.max(1, Math.round(h / k)), opt);
    this.a1 = q(4); this.a2 = q(4); this.b1 = q(8); this.b2 = q(8);
  }

  pass(material, target) {
    this.quad.material = material;
    this.r.setRenderTarget(target);
    this.r.render(this.scene, this.cam);
  }

  blurPass(src, tmp) {
    const u = this.blur.uniforms;
    u.tMap.value = src.texture; u.dir.value.set(1 / src.width, 0); this.pass(this.blur, tmp);
    u.tMap.value = tmp.texture; u.dir.value.set(0, 1 / src.height); this.pass(this.blur, src);
  }

  render(scene, camera) {
    const r = this.r;
    if (!this.enabled) { r.render(scene, camera); return; }
    this.resize();
    r.setRenderTarget(this.rt);
    r.render(scene, camera);
    // Bloom: zonas brillantes a 1/4 → desenfoque; copia a 1/8 → desenfoque más ancho.
    this.bright.uniforms.tMap.value = this.rt.texture;
    this.pass(this.bright, this.a1);
    this.blurPass(this.a1, this.a2);
    this.blur.uniforms.tMap.value = this.a1.texture;
    this.blur.uniforms.dir.value.set(0, 0);
    this.pass(this.blur, this.b1); // reducción (sin desplazamiento = copia filtrada)
    this.blurPass(this.b1, this.b2);
    const u = this.final.uniforms;
    u.tScene.value = this.rt.texture; u.tBloomA.value = this.a1.texture; u.tBloomB.value = this.b1.texture;
    this.pass(this.final, null);
  }

  dispose() {
    for (const t of [this.rt, this.a1, this.a2, this.b1, this.b2]) t?.dispose();
    this.rt = null;
  }
}
