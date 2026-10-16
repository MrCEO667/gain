// Shot 1 · marble: the Lyceum. Early morning inside an ancient Greek stoa. A row of fluted Doric columns in warm
// off-white marble on a stone floor; low sun rakes in through the colonnade, laying long bars of light and shadow
// across the paving and up the back wall, with a faint haze in the air. Fade up from black, then one slow push along
// the walkway, as if walking. No people, no statues, no text.
//
// Units in this shot are centimetres (the stage is built in millimetres, so the camera range, fog, floor and sun
// shadow are all replaced here).
import { ramp, track, smooth } from '../lib/anim.js';

export const duration = 5;
export const device = false;

// architecture
const S = 260;              // column spacing (axis to axis)
const R0 = 40, R1 = 32;     // shaft radius (to the arrises) at the foot and at the necking
const HS = 500;             // shaft height
const HB = 546;             // underside of the architrave = top of the abacus
const D = 700;              // back wall at z = -D; the column axes stand on z = 0
const CEIL = 700;           // interior ceiling
const BEAM = 640;           // underside of the ceiling beams
const BENCH_D = 48, BENCH_H = 44;
const K0 = -26, K1 = 4;     // columns at x = k * S for k in [K0, K1]
const ZC = 3000;            // the matching stoa across the courtyard
const XMIN = K0 * S - 500, XMAX = K1 * S + 500;

const DEFAULTS = {
  sunAz: -35,     // degrees: 0 = sun straight out through the colonnade (+z); negative = ahead of the camera (-x)
  sunEl: 19,      // degrees above the horizon
  sun: 8.0,       // sun intensity
  haze: 1.0,      // strength of the light shafts in the air
  dust: 1.0,      // brightness of the dust motes in the sun
  exposure: 0.78,
  cam: [
    { t: 0, v: [500, 150, -430] },
    { t: duration, v: [350, 154, -418] },
  ],
  look: [
    { t: 0, v: [-1600, 62, -120] },
    { t: duration, v: [-1750, 70, -100] },
  ],
  fov: 40,
};

// ---------------------------------------------------------------------------------------------------------------
// procedural textures (canvas): periodic value noise so every texture tiles

function hash2(x, y, s) { const h = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return h - Math.floor(h); }
function vnoise(x, y, px, py, s) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const x0 = px ? ((ix % px) + px) % px : ix, x1 = px ? (((ix + 1) % px) + px) % px : ix + 1;
  const y0 = py ? ((iy % py) + py) % py : iy, y1 = py ? (((iy + 1) % py) + py) % py : iy + 1;
  const a = hash2(x0, y0, s), b = hash2(x1, y0, s), c = hash2(x0, y1, s), d = hash2(x1, y1, s);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function fbm(x, y, px, py, s, oct = 5) {
  let v = 0, amp = 0.5, f = 1, n = 0;
  for (let o = 0; o < oct; o++) { v += amp * vnoise(x * f, y * f, px * f, py * f, s + o * 13); n += amp; amp *= 0.5; f *= 2; }
  return v / n;
}
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function canvasTexture(THREE, w, h, paint, { srgb = true, repeat = [1, 1], aniso = 8 } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const img = g.createImageData(w, h);
  paint(img.data, w, h);
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = aniso;
  return t;
}

// warm off-white marble with faint grey veining; u wraps around the column, v runs up the shaft
function paintMarble(seed) {
  return (d, w, h) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const X = (x / w) * 6, Y = (y / h) * 13;
        const warp = fbm(X, Y, 6, 13, seed, 4);
        const p1 = Y * 0.42 + X / 3 + 2.6 * warp;
        const v1 = Math.pow(1 - Math.abs(Math.sin(Math.PI * p1)), 16);
        const p2 = Y * 1.1 - (2 * X) / 3 + 3.4 * fbm(X * 1.7, Y * 1.7, 6 * 1.7, 13 * 1.7, seed + 5, 3);
        const v2 = Math.pow(1 - Math.abs(Math.sin(Math.PI * p2)), 40);
        const mask = sstep(0.38, 0.72, fbm(X * 0.6, Y * 0.6, 3.6, 7.8, seed + 9, 3));
        const vein = Math.min(1, (0.55 * v1 + 0.45 * v2) * (0.25 + 0.75 * mask));
        const mottle = 0.955 + 0.07 * fbm(X * 2, Y * 2, 12, 26, seed + 3, 4);
        const i = (y * w + x) * 4;
        const k = 0.42 * vein;
        d[i] = (236 * (1 - k) + 138 * k) * mottle;
        d[i + 1] = (232 * (1 - k) + 137 * k) * mottle;
        d[i + 2] = (225 * (1 - k) + 135 * k) * mottle;
        d[i + 3] = 255;
      }
    }
  };
}

// stone paving: courses of irregular slabs, staggered. The texture covers 960 × 480 cm and tiles.
const ROWS = [70, 90, 75, 85, 80, 80];
const CUTS = ROWS.map((_, r) => {
  const n = 7 + (r % 2), len = Array.from({ length: n }, (_, i) => 0.75 + 0.5 * hash2(r, i, 4));
  const sum = len.reduce((a, b) => a + b, 0);
  const cuts = []; let x = hash2(r, 1, 9) * 110;
  for (const l of len) { cuts.push(x); x += (l / sum) * 960; }
  return cuts;
});
function paintFloor(d, w, h) {
  const TW = 960, TH = 480;
  for (let y = 0; y < h; y++) {
    const Y = (y / h) * TH;
    let row = 0, y0 = 0; while (row < ROWS.length - 1 && Y >= y0 + ROWS[row]) { y0 += ROWS[row]; row++; }
    const cuts = CUTS[row], ey = Math.min(Y - y0, y0 + ROWS[row] - Y);
    for (let x = 0; x < w; x++) {
      const X = (x / w) * TW;
      // which slab: cuts are positions in [0, 960 + cuts[0]); wrap X so it falls after the first cut
      const xx = X < cuts[0] ? X + TW : X;
      let col = 0; while (col < cuts.length - 1 && xx >= cuts[col + 1]) col++;
      const c1 = col < cuts.length - 1 ? cuts[col + 1] : cuts[0] + TW;
      const ex = Math.min(xx - cuts[col], c1 - xx);
      const id = hash2(col, row, 3.3), id2 = hash2(col, row, 8.1);
      const e = Math.min(ex, ey);
      const joint = 1 - sstep(0.2, 0.7, e);
      const wear = 1 - 0.05 * (1 - sstep(0.5, 5, e));
      const cloud = fbm(X / 60, Y / 60, TW / 60, TH / 60, 21 + id * 7, 4);
      const fine = fbm(X / 3, Y / 3, TW / 3, TH / 3, 33, 2);
      const tone = (0.88 + 0.16 * id) * (0.92 + 0.13 * cloud) * (0.965 + 0.06 * fine) * wear * (1 - 0.42 * joint);
      const warm = (id2 - 0.5) * 7;
      const i = (y * w + x) * 4;
      d[i] = (170 + warm) * tone; d[i + 1] = 166 * tone; d[i + 2] = (159 - warm) * tone; d[i + 3] = 255;
    }
  }
}

// ashlar back wall: tall orthostates at the foot, then 50 cm courses; baked occlusion at floor and ceiling.
// The texture covers 960 cm of wall length and the full 700 cm height.
function paintWall(d, w, h) {
  const TW = 960, TH = CEIL;
  for (let y = 0; y < h; y++) {
    const Y = (1 - y / h) * TH;   // height above the floor
    const course = Y < 100 ? 0 : 1 + Math.floor((Y - 100) / 50);
    const y0 = course === 0 ? 0 : 100 + (course - 1) * 50, y1 = course === 0 ? 100 : y0 + 50;
    const bw = course === 0 ? 160 : 120, off = (course % 2) * (bw / 2);
    const ao = (0.62 + 0.38 * sstep(0, 70, Y)) * (1 - 0.4 * sstep(520, 700, Y));
    for (let x = 0; x < w; x++) {
      const X = (x / w) * TW;
      const xx = (X + off) % TW, col = Math.floor(xx / bw);
      const id = hash2(col, course, 5.7);
      const e = Math.min(xx - col * bw, (col + 1) * bw - xx, Y - y0, y1 - Y);
      const joint = 1 - sstep(0.2, 0.6, e);
      const cloud = fbm(X / 50, Y / 50, TW / 50, 0, 41, 4);
      const tone = (0.93 + 0.09 * id) * (0.94 + 0.1 * cloud) * (1 - 0.4 * joint) * ao;
      const i = (y * w + x) * 4;
      d[i] = 200 * tone; d[i + 1] = 196 * tone; d[i + 2] = 189 * tone; d[i + 3] = 255;
    }
  }
}

function paintRadial(stops) {
  return (d, w, h) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const r = Math.hypot((x + 0.5) / w - 0.5, (y + 0.5) / h - 0.5) * 2;
      const i = (y * w + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = 0; d[i + 3] = 255 * stops(r);
    }
  };
}

// ---------------------------------------------------------------------------------------------------------------
// geometry

// A Doric shaft: 20 shallow flutes meeting at sharp arrises, with entasis. Each flute has its own vertices, so the
// arrises stay crisp; normals are analytic.
function flutedShaft(THREE) {
  const N = 20, M = 9, ROWS = 28, k = 0.06;
  const pos = [], nor = [], uv = [], idx = [];
  const r = (y) => R0 - (R0 - R1) * Math.pow(y / HS, 1.5);
  const dr = (y) => -(R0 - R1) * 1.5 * Math.sqrt(Math.max(0, y / HS)) / HS;
  for (let f = 0; f < N; f++) {
    const base = pos.length / 3;
    for (let i = 0; i <= ROWS; i++) {
      const y = (i / ROWS) * HS;
      for (let j = 0; j <= M; j++) {
        const phi = j / M, th = ((f + phi) / N) * Math.PI * 2;
        const g = 1 - k * Math.sin(Math.PI * phi), gp = -k * Math.cos(Math.PI * phi) * N / 2;
        const rho = r(y) * g, rhoT = r(y) * gp, rhoY = dr(y) * g;
        const c = Math.cos(th), s = Math.sin(th);
        pos.push(rho * c, y, rho * s);
        const pt = new THREE.Vector3(rhoT * c - rho * s, 0, rhoT * s + rho * c);
        const py = new THREE.Vector3(rhoY * c, 1, rhoY * s);
        const n = py.cross(pt).normalize();
        nor.push(n.x, n.y, n.z);
        uv.push((f + phi) / N, y / HS);
      }
    }
    for (let i = 0; i < ROWS; i++) for (let j = 0; j < M; j++) {
      const a = base + i * (M + 1) + j, b = a + (M + 1), c = a + 1, dd = b + 1;
      idx.push(a, b, c, b, dd, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  return geo;
}

// necking annulets and the echinus cushion, turned on a lathe; the square abacus sits on top
function capitalGeometry(THREE) {
  const pts = [];
  const p = (x, y) => pts.push(new THREE.Vector2(x, y));
  p(0, HS - 2); p(R1 * 0.985, HS - 2); p(R1 * 0.985, HS);
  for (let a = 0; a < 3; a++) { const y = HS + 2 + a * 3.2; p(R1 + 0.4, y - 1.2); p(R1 + 1.4, y); p(R1 + 0.4, y + 1.2); }
  const e0 = HS + 11, e1 = 528;
  for (let i = 0; i <= 14; i++) {
    const t = i / 14;
    const x = R1 + 0.5 + (46 - R1 - 0.5) * (1 - Math.pow(1 - t, 2.2));
    p(x, e0 + (e1 - e0) * Math.pow(t, 1.25));
  }
  p(0, e1);
  return new THREE.LatheGeometry(pts, 64);
}

function box(THREE, mat, x0, x1, y0, y1, z0, z1) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return m;
}

// No global illumination here, so the warm light bounced up from the sunlit paving is faked: an indirect diffuse
// term that grows toward the floor, on faces that look sideways or down.
function addBounce(mat, color, height, specMax = 100) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uBounce = { value: color };
    sh.uniforms.uBounceH = { value: height };
    sh.uniforms.uSpecMax = { value: specMax };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBWorld;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvBWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uBounce; uniform float uBounceH, uSpecMax; varying vec3 vBWorld;')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      {
        vec3 wn = inverseTransformDirection(normal, viewMatrix);
        float h = 1.0 - smoothstep(0.0, uBounceH, vBWorld.y);
        float facing = clamp(0.6 - 0.5 * wn.y, 0.0, 1.0);
        reflectedLight.indirectDiffuse += uBounce * h * facing * BRDF_Lambert(material.diffuseColor);
        // keep sun glints on the flutes crisp and below the bloom threshold
        reflectedLight.directSpecular = min(reflectedLight.directSpecular, vec3(uSpecMax));
      }`);
  };
}

// ---------------------------------------------------------------------------------------------------------------
// light in the air: the shafts are integrated analytically. A point inside the stoa is sunlit when the ray toward
// the sun passes between two columns and under the architrave; along a view ray that is a periodic box function,
// whose integral has a closed form. No ray marching, so it is exact, smooth and cheap.
const hazeVert = /* glsl */`
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const hazeFrag = /* glsl */`
uniform vec3 uL;        // unit vector toward the sun
uniform vec3 uCol;      // sun colour × haze density
uniform vec3 uBMin, uBMax;
uniform float uS, uRp, uHmax, uSigma, uG;
varying vec3 vWorld;

float gapIntegral(float v) {
  float k = floor(v / uS);
  return k * (uS - 2.0 * uRp) + max(0.0, v - k * uS - 2.0 * uRp);
}
float litLength(vec3 ro, vec3 rd, float ta, float tb) {
  float ax = uL.x / uL.z, ay = uL.y / uL.z;
  float a = ro.x - ro.z * ax + uRp, b = rd.x - rd.z * ax;
  float c = ro.y - ro.z * ay, d = rd.y - rd.z * ay;
  if (abs(d) < 1e-6) { if (c >= uHmax) return 0.0; }
  else if (d > 0.0) tb = min(tb, (uHmax - c) / d);
  else ta = max(ta, (uHmax - c) / d);
  if (tb <= ta) return 0.0;
  if (abs(b) < 1e-5) return mod(a + b * ta, uS) > 2.0 * uRp ? tb - ta : 0.0;
  return abs(gapIntegral(a + b * tb) - gapIntegral(a + b * ta)) / abs(b);
}
void main() {
  vec3 ro = cameraPosition;
  vec3 rd = normalize(vWorld - ro);
  vec3 inv = 1.0 / rd;
  vec3 t0 = (uBMin - ro) * inv, t1 = (uBMax - ro) * inv;
  vec3 tn3 = min(t0, t1), tf3 = max(t0, t1);
  float tn = max(max(tn3.x, tn3.y), max(tn3.z, 0.0));
  float tf = min(min(tf3.x, tf3.y), tf3.z);
  if (tf <= tn) discard;
  float sum = 0.0;
  float seg = (tf - tn) / 6.0;
  for (int i = 0; i < 6; i++) {
    float s0 = tn + seg * float(i);
    sum += exp(-uSigma * (s0 + 0.5 * seg)) * litLength(ro, rd, s0, s0 + seg);
  }
  float mu = dot(rd, uL);
  float g = uG;
  float hg = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * mu, 1.5);
  gl_FragColor = vec4(uCol * (0.35 + 0.65 * hg) * sum, 1.0);
}`;

const skyVert = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const skyFrag = /* glsl */`
uniform vec3 uHorizon, uZenith, uSunCol, uL;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  vec3 c = mix(uHorizon, uZenith, pow(max(d.y, 0.0), 0.5));
  float mu = max(dot(d, uL), 0.0);
  c += uSunCol * (0.35 * pow(mu, 5.0) + 0.8 * pow(mu, 48.0));
  // two faint ranges of hills far out in the haze
  float az = atan(d.x, d.z);
  float h1 = 0.030 + 0.014 * sin(az * 2.3 + 1.0) + 0.006 * sin(az * 6.1 + 2.0) + 0.002 * sin(az * 17.0);
  float h2 = 0.012 + 0.007 * sin(az * 4.2 + 0.3) + 0.003 * sin(az * 11.0 + 1.7);
  c = mix(c, uHorizon * 0.86, 0.75 * (1.0 - smoothstep(h1 - 0.0012, h1 + 0.0012, d.y)));
  c = mix(c, uHorizon * 0.74, 0.8 * (1.0 - smoothstep(h2 - 0.0012, h2 + 0.0012, d.y)));
  gl_FragColor = vec4(c, 1.0);
}`;

// ---------------------------------------------------------------------------------------------------------------

export function setup({ THREE, stage }, overrides = {}) {
  const o = { ...DEFAULTS, ...overrides };
  const { scene, camera, lights, renderer } = stage;
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  // stage: no studio floor, our own sky, haze and range
  stage.floor.visible = false;
  camera.near = 8; camera.far = 80000; camera.fov = o.fov; camera.updateProjectionMatrix();
  scene.add(camera);

  const deg = Math.PI / 180;
  const L = new THREE.Vector3(Math.sin(o.sunAz * deg) * Math.cos(o.sunEl * deg), Math.sin(o.sunEl * deg), Math.cos(o.sunAz * deg) * Math.cos(o.sunEl * deg)).normalize();
  const sunColor = new THREE.Color(0xffe3c4);
  const lin = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k);

  const horizon = lin(0xdcd5cb, 0.85), zenith = lin(0xb4b4b3, 0.5);
  scene.background = null;
  // interior air: a dim warm haze, so the far end of the walkway sinks into soft shade
  scene.fog = new THREE.FogExp2(lin(0x383634, 0.5), 1.4e-4);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(40000, 48, 24), new THREE.ShaderMaterial({
    vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uHorizon: { value: horizon }, uZenith: { value: zenith }, uSunCol: { value: sunColor.clone().multiplyScalar(1.4) }, uL: { value: L } },
  }));
  sky.renderOrder = -10;
  scene.add(sky);

  // a soft environment for reflections: bright exterior beyond the colonnade (+z), dim interior behind (-z)
  {
    const env = new THREE.Scene();
    const envMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, fog: false,
      uniforms: { uL: { value: L } },
      vertexShader: skyVert,
      fragmentShader: /* glsl */`
        uniform vec3 uL; varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float out_ = smoothstep(-0.2, 0.5, d.z) * (1.0 - smoothstep(0.15, 0.6, d.y));
          vec3 c = mix(vec3(0.05, 0.045, 0.04), vec3(1.25, 1.15, 1.02), out_);
          c += vec3(0.12, 0.10, 0.08) * smoothstep(0.0, -0.6, d.y);
          c += vec3(1.6, 1.4, 1.1) * pow(max(dot(d, uL), 0.0), 24.0);
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    env.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), envMat));
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(env, 0.03).texture;
    pmrem.dispose();
    scene.environmentIntensity = 0.1;
  }

  // lights: the studio key becomes the sun; the others become sky fill and floor bounce
  const sun = lights.key;
  sun.color.copy(sunColor); sun.intensity = o.sun;
  const target = new THREE.Vector3(-900, 0, -250);
  sun.target.position.copy(target); scene.add(sun.target);
  sun.position.copy(target).addScaledVector(L, 4000);
  {
    // fit the shadow camera to the part of the stoa we see
    const probe = new THREE.OrthographicCamera();
    probe.position.copy(sun.position); probe.lookAt(target); probe.updateMatrixWorld(true);
    const inv = probe.matrixWorld.clone().invert();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const x of [XMIN - 60, 1600]) for (const y of [-60, 780]) for (const z of [-D - 80, 200]) {
      const p = new THREE.Vector3(x, y, z).applyMatrix4(inv);
      x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
    }
    Object.assign(sun.shadow.camera, { left: x0, right: x1, bottom: y0, top: y1, near: Math.max(1, -z1 - 200), far: -z0 + 200 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.mapSize.set(4096, 4096);
    sun.shadow.bias = -0.0003; sun.shadow.normalBias = 1.2;
    // wider PCF taps for a softer penumbra on the long shadows
    renderer.shadowMap.type = THREE.PCFShadowMap; sun.shadow.radius = 3;
  }
  lights.hemi.color.set(0xc4c6c9); lights.hemi.groundColor.set(0x8a7d6c); lights.hemi.intensity = 0.1;
  // warm bounce from the sunlit paving onto the ceiling, the soffits and the shaded sides of the shafts
  lights.fill.color.set(0xffd8b0); lights.fill.intensity = 0.22;
  lights.fill.position.set(-300, -800, 500); // shines upward and inward (target at the origin)
  // cool-neutral skylight through the colonnade onto the back wall and the inner faces
  lights.rim.color.set(0xdfe2e6); lights.rim.intensity = 0.1;
  lights.rim.position.set(200, 300, 1000);

  // materials
  const marbleMats = [11, 23, 37, 51].map((seed) => new THREE.MeshStandardMaterial({
    map: canvasTexture(THREE, 512, 1024, paintMarble(seed), { aniso }), roughness: 0.4, envMapIntensity: 1.0,
  }));
  const marbleTop = marbleMats[0];
  for (const m of marbleMats) addBounce(m, lin(0xffe2c4, 0.8), 460, 0.35);
  const floorTex = canvasTexture(THREE, 2048, 1024, paintFloor, { aniso, repeat: [(XMAX - XMIN) / 960, (D + 60) / 480] });
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.5, envMapIntensity: 0.22 });
  const wallTex = canvasTexture(THREE, 2048, 1024, paintWall, { aniso, repeat: [(XMAX - XMIN) / 960, 1] });
  const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.78 });
  addBounce(wallMat, lin(0xffe0bf, 0.45), 380);
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xc4bfb6, roughness: 0.7 });
  const ceilMat = new THREE.MeshStandardMaterial({ color: 0x75706a, roughness: 0.85 });
  addBounce(ceilMat, lin(0xffe0bf, 0.2), 1e5);
  addBounce(stoneMat, lin(0xffe0bf, 0.3), 200);
  // Outside: a courtyard, with the matching stoa across it (z = ZC) standing against the low sun. All of it is
  // seen only through the colonnade and through the morning haze, so it is drawn unlit with its own aerial
  // perspective. The far stoa's long shadow on the courtyard is analytic: a sun ray is blocked when it meets the
  // far facade below the roof line.
  const exterior = { uL: { value: L }, uFar: { value: horizon }, uDen: { value: 1 / 6000 }, uZC: { value: ZC }, uRoof: { value: 800 } };
  const groundMat = new THREE.ShaderMaterial({
    vertexShader: hazeVert, fog: false,
    uniforms: { ...exterior, uNear: { value: lin(0xb3a690, 0.62) }, uShadeG: { value: lin(0xb3a690, 0.15) } },
    fragmentShader: /* glsl */`
      uniform vec3 uNear, uShadeG, uFar, uL; uniform float uDen, uZC, uRoof; varying vec3 vWorld;
      void main() {
        float s = (uZC - 62.0 - vWorld.z) / uL.z;
        float lit = s < 0.0 ? 0.0 : smoothstep(uRoof - 20.0, uRoof + 20.0, vWorld.y + s * uL.y);
        float f = 1.0 - exp(-pow(distance(vWorld, cameraPosition) * uDen, 2.0));
        gl_FragColor = vec4(mix(mix(uShadeG, uNear, lit), uFar, f), 1.0);
      }`,
  });
  const farMat = new THREE.ShaderMaterial({
    fog: false,
    uniforms: { ...exterior, uShade: { value: lin(0xd8d2ca, 0.14) } },
    vertexShader: /* glsl */`
      varying vec3 vWorld; varying vec3 vN;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uShade, uFar; uniform float uDen, uZC; varying vec3 vWorld; varying vec3 vN;
      void main() {
        vec3 n = normalize(vN);
        float inside = smoothstep(uZC + 20.0, uZC + 140.0, vWorld.z);
        vec3 c = uShade * (0.72 + 0.28 * n.y - 0.12 * n.z) * (1.0 - 0.8 * inside);
        float f = 1.0 - exp(-pow(distance(vWorld, cameraPosition) * uDen, 2.0));
        gl_FragColor = vec4(mix(c, uFar, f), 1.0);
      }`,
  });

  const world = new THREE.Group();
  scene.add(world);
  const add = (m, shadow = true) => { m.castShadow = shadow; m.receiveShadow = true; world.add(m); return m; };

  // floor of the stoa and the stylobate steps down to the open ground
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(XMAX - XMIN, D + 60), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.set((XMIN + XMAX) / 2, 0, (-D + 60) / 2);
  add(floor, false);
  add(box(THREE, stoneMat, XMIN, XMAX, -20, -2, -D, 60));
  add(box(THREE, stoneMat, XMIN, XMAX, -40, -20, -D, 100));
  add(box(THREE, stoneMat, XMIN, XMAX, -60, -40, -D, 140));
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(90000, 40000), groundMat);
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, -60, 20140);
  add(ground, false);
  {
    const far = new THREE.Group();
    const fb = (...a) => far.add(box(THREE, farMat, ...a));
    const colGeo = new THREE.CylinderGeometry(R1, R0, HS, 40, 1, true), capGeo = capitalGeometry(THREE);
    for (let k = K0; k <= K1; k++) {
      const x = k * S + S / 2;
      const c = new THREE.Mesh(colGeo, farMat); c.position.set(x, HS / 2, ZC); far.add(c);
      const e = new THREE.Mesh(capGeo, farMat); e.position.set(x, 0, ZC); far.add(e);
      fb(x - 47, x + 47, 528, HB, ZC - 47, ZC + 47);
    }
    fb(XMIN, XMAX, HB, 618, ZC - 46, ZC + 46);
    fb(XMIN, XMAX, 618, 690, ZC - 40, ZC + 40);
    fb(XMIN, XMAX, 690, 716, ZC - 62, ZC + 50);
    fb(XMIN, XMAX, CEIL, 800, ZC + 40, ZC + D + 60);
    fb(XMIN, XMAX, 0, CEIL, ZC + D, ZC + D + 60);
    fb(XMIN, XMAX, -60, 0, ZC - 60, ZC + D);
    fb(XMIN, XMAX, -60, -20, ZC - 140, ZC - 60);
    fb(XMIN, XMAX, -40, -20, ZC - 100, ZC - 60);
    far.traverse((m) => { m.castShadow = false; m.receiveShadow = false; });
    scene.add(far);
  }

  // the colonnade
  const shaftGeo = flutedShaft(THREE), capGeo = capitalGeometry(THREE);
  const contactTex = canvasTexture(THREE, 256, 256, paintRadial((r) => {
    const rr = r * (R0 + 60);
    return rr < R0 - 2 ? 0.0 : 0.5 * Math.pow(1 - sstep(R0 - 2, R0 + 55, rr), 1.6);
  }), { srgb: false });
  const contactMat = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: contactTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: false });
  const contactGeo = new THREE.PlaneGeometry(2 * (R0 + 60), 2 * (R0 + 60));
  for (let k = K0; k <= K1; k++) {
    const x = k * S;
    const mat = marbleMats[((k % 4) + 4) % 4];
    const shaft = add(new THREE.Mesh(shaftGeo, mat));
    shaft.position.set(x, 0, 0); shaft.rotation.y = (k * 0.7) % (Math.PI / 10);
    const cap = add(new THREE.Mesh(capGeo, marbleTop)); cap.position.set(x, 0, 0);
    add(box(THREE, marbleTop, x - 47, x + 47, 528, HB, -47, 47));
    const c = new THREE.Mesh(contactGeo, contactMat);
    c.rotation.x = -Math.PI / 2; c.position.set(x, 0.3, 0); world.add(c);
  }

  // entablature, roof and the coffered ceiling with cross beams
  add(box(THREE, marbleTop, XMIN, XMAX, HB, 618, -46, 46));
  add(box(THREE, marbleTop, XMIN, XMAX, 618, 690, -40, 40));
  add(box(THREE, marbleTop, XMIN, XMAX, 690, 716, -50, 62));
  add(box(THREE, ceilMat, XMIN, XMAX, CEIL, 760, -D - 60, -40));
  for (let k = K0; k <= K1; k++) {
    for (const h of [0, 0.5]) {
      const x = (k + h) * S;
      add(box(THREE, ceilMat, x - 17, x + 17, BEAM, CEIL, -D, -46));
    }
  }
  add(box(THREE, ceilMat, XMIN, XMAX, BEAM + 20, CEIL, -D, -D + 30));

  // back wall with a low plinth and a long stone bench; end wall at the near end
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(XMAX - XMIN, CEIL), wallMat);
  wall.position.set((XMIN + XMAX) / 2, CEIL / 2, -D);
  add(wall);
  add(box(THREE, stoneMat, XMIN, XMAX, 0, BENCH_H - 7, -D, -D + BENCH_D - 4));
  add(box(THREE, stoneMat, XMIN, XMAX, BENCH_H - 7, BENCH_H, -D, -D + BENCH_D));
  add(box(THREE, wallMat, XMAX, XMAX + 60, 0, CEIL, -D, 46));
  add(box(THREE, wallMat, XMIN - 60, XMIN, 0, CEIL, -D, 46));
  // soft occlusion along the foot of the bench
  {
    const tex = canvasTexture(THREE, 4, 128, (d, w, h) => {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; d[i] = d[i + 1] = d[i + 2] = 0; d[i + 3] = 255 * 0.45 * Math.pow(y / (h - 1), 2.2); }
    }, { srgb: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(XMAX - XMIN, 70), new THREE.MeshBasicMaterial({ color: 0, alphaMap: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, fog: false }));
    m.rotation.x = -Math.PI / 2; m.position.set((XMIN + XMAX) / 2, 0.3, -D + BENCH_D + 35);
    world.add(m);
  }

  // the light shafts in the air (inside the stoa, between the column faces and the bench)
  const cz = Math.abs(L.z) / Math.hypot(L.x, L.z);
  const bmin = new THREE.Vector3(XMIN, 0, -D + BENCH_D), bmax = new THREE.Vector3(XMAX, BEAM, -R0);
  const hazeMat = new THREE.ShaderMaterial({
    vertexShader: hazeVert, fragmentShader: hazeFrag, side: THREE.BackSide, transparent: true, depthWrite: false, depthTest: false,
    blending: THREE.AdditiveBlending, fog: false,
    uniforms: {
      uL: { value: L }, uCol: { value: sunColor.clone().multiplyScalar(o.sun * 1.1e-5 * o.haze) },
      uBMin: { value: bmin }, uBMax: { value: bmax },
      uS: { value: S }, uRp: { value: 37 / cz }, uHmax: { value: HB - 46 * (L.y / L.z) }, uSigma: { value: 1.2e-4 }, uG: { value: 0.55 },
    },
  });
  const haze = new THREE.Mesh(new THREE.BoxGeometry(bmax.x - bmin.x, bmax.y - bmin.y, bmax.z - bmin.z), hazeMat);
  haze.position.copy(bmin).add(bmax).multiplyScalar(0.5);
  haze.renderOrder = 10; haze.frustumCulled = false;
  scene.add(haze);

  // dust motes drifting in the sun: lit only where the analytic shaft test says the sun reaches them
  const dustMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: {
      uTime: { value: 0 }, uL: { value: L }, uS: { value: S }, uRp: { value: 37 / cz }, uHmax: { value: HB - 46 * (L.y / L.z) },
      uCol: { value: sunColor.clone().multiplyScalar(1.3 * o.dust) }, uPx: { value: renderer.domElement.height / (2 * Math.tan((o.fov * deg) / 2)) },
    },
    vertexShader: /* glsl */`
      attribute float aSeed;
      uniform float uTime, uS, uRp, uHmax, uPx; uniform vec3 uL;
      varying float vA;
      void main() {
        vec3 p = position + vec3(sin(uTime * 0.31 + aSeed * 40.0) * 5.0, sin(uTime * 0.23 + aSeed * 17.0) * 4.0 + uTime * (aSeed - 0.4) * 4.0, cos(uTime * 0.27 + aSeed * 23.0) * 5.0);
        float qx = p.x - p.z * uL.x / uL.z, qy = p.y - p.z * uL.y / uL.z;
        float v = mod(qx + uRp, uS);
        float lit = smoothstep(2.0 * uRp, 2.0 * uRp + 6.0, v) * (1.0 - smoothstep(uS - 6.0, uS, v)) * (1.0 - smoothstep(uHmax - 6.0, uHmax, qy));
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        float size = (0.2 + 0.35 * fract(aSeed * 7.13)) * uPx / max(-mv.z, 1.0);
        gl_PointSize = clamp(size, 2.0, 18.0);
        vA = lit * min(1.0, size / 2.0) * min(1.0, pow(5.0 / size, 2.0)) * (0.5 + 0.5 * sin(uTime * 0.9 + aSeed * 61.0));
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uCol; varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        gl_FragColor = vec4(uCol * vA * smoothstep(0.5, 0.1, d), 1.0);
      }`,
  });
  {
    const N = 1400, pos = new Float32Array(N * 3), seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = -1100 + 1550 * hash2(i, 1, 2); pos[i * 3 + 1] = 15 + 480 * hash2(i, 2, 2); pos[i * 3 + 2] = -650 + 590 * hash2(i, 3, 2);
      seed[i] = hash2(i, 4, 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const dust = new THREE.Points(g, dustMat);
    dust.frustumCulled = false; dust.renderOrder = 11;
    scene.add(dust);
  }

  // a gentle lens vignette, fixed to the camera
  {
    const tex = canvasTexture(THREE, 256, 256, paintRadial((r) => 0.62 * Math.pow(sstep(0.55, 1.45, r), 1.4)), { srgb: false });
    const dist = 20, hgt = 2 * dist * Math.tan((o.fov * deg) / 2);
    const v = new THREE.Mesh(new THREE.PlaneGeometry(hgt * camera.aspect * 1.02, hgt * 1.02), new THREE.MeshBasicMaterial({ color: 0, alphaMap: tex, transparent: true, depthTest: false, depthWrite: false, fog: false }));
    v.position.z = -dist; v.renderOrder = 20; v.frustumCulled = false;
    camera.add(v);
  }

  return {
    update(t) {
      camera.position.set(...track(o.cam, t, smooth));
      camera.lookAt(...track(o.look, t, smooth));
      // fade up from black over the first 0.6 s
      renderer.toneMappingExposure = o.exposure * smooth(ramp(t, 0, 0.62, (x) => x));
      dustMat.uniforms.uTime.value = t + 3;
    },
  };
}
