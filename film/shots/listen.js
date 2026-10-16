// Shot 4 · listen: voice becomes work. A close, high three-quarter view of the clean ceramic top in the dark studio.
// The hidden sensor wakes as a ring of light under an implied thumb, the slit speaks, and from ~2.4 s thin threads of
// warm-white light stream out from under the device, across the dark floor and away into the distance, carrying the
// rhythm of the voice as travelling pulses. The camera pulls back and rises to show how far they reach.
import { clamp, lerp, ramp, smooth } from '../lib/anim.js';

export const duration = 6;

const WARM = 0xfff4e6;

// Deterministic pseudo-random numbers, so every render of a frame is identical.
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let x = s; x = Math.imul(x ^ (x >>> 15), x | 1); x ^= x + Math.imul(x ^ (x >>> 7), x | 61); return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}

// A speech-like envelope: syllables (fast attack, softer decay) grouped into short phrases with breaths between them.
function makeSpeech(t0, t1, seed) {
  const r = rng(seed), syl = [];
  let t = t0;
  while (t < t1) {
    const n = 3 + Math.floor(r() * 4);                     // syllables in this phrase
    for (let i = 0; i < n && t < t1; i++) {
      const d = 0.11 + r() * 0.12, a = 0.55 + r() * 0.45;
      syl.push({ t, d, a: i === 0 ? Math.max(a, 0.85) : a });
      t += d + 0.03 + r() * 0.07;
    }
    t += 0.22 + r() * 0.2;                                 // a breath
  }
  return (x) => {
    let v = 0;
    for (const s of syl) {
      const u = (x - s.t) / s.d;
      if (u <= 0 || u >= 1.6) continue;
      // attack over the first 25%, then an exponential-ish release
      const e = u < 0.25 ? smooth(u / 0.25) : Math.exp(-(u - 0.25) * 2.6) * (1 - smooth((u - 1.2) / 0.4));
      v = Math.max(v, s.a * e);
    }
    return v;
  };
}

export function setup({ THREE, stage, device }) {
  const { scene, camera, renderer, lights } = stage;

  // ------------------------------------------------------------------ stage: darker studio, the floor falls away into black
  const BG = new THREE.Color(0x040405);
  scene.background = BG;
  scene.fog = new THREE.Fog(BG, 900, 2800);
  // the threads are drawn with their glow straddling the floor plane: let the floor shade but not occlude them
  stage.floor.material.depthWrite = false;
  stage.floor.material.specularIntensity = 0.35;
  const baseExposure = renderer.toneMappingExposure;
  lights.rim.intensity *= 0.6;
  // a soft pool around the device: the floor darkens radially to black, so the distance is a void. The long, dark
  // gradient would band into rings at 8 bits, so this pass also adds a ±1 LSB triangular dither in screen space
  // (premultiplied: out = n + floor·(1 − a)); on pure black the ACES toe swallows it.
  {
    const g = new THREE.PlaneGeometry(4800, 4800); g.rotateX(-Math.PI / 2); g.translate(0, 0.02, 0);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uAmp: { value: 0.0013 } },
      vertexShader: /* glsl */`
        varying vec2 vXZ;
        void main() { vec4 w = modelMatrix * vec4(position, 1.0); vXZ = w.xz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */`
        uniform float uAmp;
        varying vec2 vXZ;
        float hash(vec2 p) { p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
        float sm(float x) { x = clamp(x, 0.0, 1.0); return x * x * (3.0 - 2.0 * x); }
        void main() {
          float r = length(vXZ);                                        // mm from the device
          float a = min(1.0, sm((r - 90.0) / 900.0) * 0.97 + sm((r - 1400.0) / 600.0) * 0.03);
          float n = hash(gl_FragCoord.xy) + hash(gl_FragCoord.xy + 17.31) - 1.0;   // triangular, −1..1
          gl_FragColor = vec4(vec3(n * uAmp), a);
        }`,
      transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    const dark = new THREE.Mesh(g, mat);
    dark.renderOrder = 2; scene.add(dark);
  }

  // ------------------------------------------------------------------ the voice: one speech envelope drives slit and threads
  const speech = makeSpeech(1.42, 7.5, 7);

  // ------------------------------------------------------------------ threads
  // Each thread's position along its length is kept in a log-distance coordinate σ (seconds of growth):
  // s(σ) = S0 (e^{Kσ} − 1). Things that move uniformly in σ slow down near the lens and speed up far away, so on screen
  // they travel at an even, unhurried pace.
  const S0 = 16, K = 2.15;
  const sOf = (sig) => S0 * (Math.exp(K * sig) - 1);
  const sigOf = (s) => Math.log(1 + s / S0) / K;

  const dirF = new THREE.Vector2(0.79, -0.615).normalize();         // toward the unseen computer (x, z)
  const perpF = new THREE.Vector2(-dirF.y, dirF.x);                  // lateral, pointing +x/+z
  const starts = [
    { p: [-34, -19], n: [0, -1] },
    { p: [-15, -19], n: [0, -1] },
    { p: [4, -19], n: [0, -1] },
    { p: [23, -19], n: [0.15, -1] },
    { p: [43, -15], n: [0.7, -0.7] },
    { p: [47, -4], n: [1, -0.15] },
    { p: [47, 9], n: [1, 0] },
  ];
  const NT = starts.length;
  const R = rng(11);
  const threads = starts.map((st, i) => {
    const L = 9000 + R() * 2000;
    const lateral = lerp(-140, 140, i / (NT - 1));
    const P0 = new THREE.Vector2(...st.p);
    const n0 = new THREE.Vector2(...st.n).normalize().lerp(dirF, 0.45).normalize();
    const E = dirF.clone().multiplyScalar(L * 0.95).addScaledVector(perpF, lateral);
    const P1 = P0.clone().addScaledVector(n0, 120 + R() * 50);
    const P2 = E.clone().addScaledVector(dirF, -(5200 + R() * 800));
    return { i, L, P0, P1, P2, P3: E, t0: 2.4 + [0.0, 0.18, 0.06, 0.26, 0.1, 0.32, 0.14][i], lag: R() * 0.25, seed: i * 97 + 5 };
  });

  // per-thread signal along emission time te, in a small texture: the shared voice plus the thread's own packets
  const TW = 1024, TMIN = -1, TMAX = 7;
  const sigData = new Uint8Array(TW * NT * 4);
  threads.forEach((th, row) => {
    const r = rng(th.seed);
    const packets = [];
    for (let t = 2.3 + r() * 0.5; t < TMAX; t += 0.6 + r() * 0.7) packets.push({ t, a: 0.55 + r() * 0.45 });
    for (let j = 0; j < TW; j++) {
      const te = TMIN + (j + 0.5) / TW * (TMAX - TMIN);
      let pk = 0;
      for (const p of packets) { const u = (te - p.t) / 0.035; pk = Math.max(pk, p.a * Math.exp(-u * u)); }
      const o = 4 * (row * TW + j);
      sigData[o] = Math.round(255 * clamp(speech(te))); sigData[o + 1] = Math.round(255 * clamp(pk)); sigData[o + 3] = 255;
    }
  });
  const sigTex = new THREE.DataTexture(sigData, TW, NT);
  sigTex.magFilter = THREE.LinearFilter; sigTex.minFilter = THREE.LinearFilter; sigTex.needsUpdate = true;

  const res = new THREE.Vector2();
  renderer.getDrawingBufferSize(res);
  const warm = new THREE.Color(WARM);

  const common = /* glsl */`
    uniform sampler2D uSig;
    uniform float uRow, uTime, uHead, uLag, uSigEnd, uLen, uGain;
    float sigAt(float te) { return texture2D(uSig, vec2((te - ${TMIN.toFixed(1)}) / ${(TMAX - TMIN).toFixed(1)}, uRow)).r; }
    vec2 sigPk(float te) { vec4 s = texture2D(uSig, vec2((te - ${TMIN.toFixed(1)}) / ${(TMAX - TMIN).toFixed(1)}, uRow)); return s.rg; }
    // brightness along the thread at log-distance sig and arc length s
    float lightAt(float sig, float s) {
      float grown = smoothstep(uHead, uHead - 0.14, sig);                 // soft growth front
      float te = uTime - sig;                                             // the signal emitted when this point was lit
      vec2 sp = sigPk(te);
      float tip = exp(-pow((sig - uHead + 0.05) / 0.07, 2.0)) * (1.0 - smoothstep(0.6 * uSigEnd, uSigEnd, uHead));
      float fade = (1.0 - smoothstep(0.55 * uLen, uLen, s)) * exp(-pow(s / 3600.0, 1.5));
      return grown * fade * (0.55 + 1.4 * sp.x * sp.x + 1.7 * sp.y + 1.2 * tip);
    }
  `;

  const threadMat = (th, row) => new THREE.ShaderMaterial({
    uniforms: {
      uSig: { value: sigTex }, uRow: { value: (row + 0.5) / NT }, uTime: { value: 0 }, uHead: { value: -1 }, uLag: { value: th.lag },
      uSigEnd: { value: sigOf(th.L) }, uLen: { value: th.L }, uGain: { value: 1 },
      uColor: { value: warm.clone() }, uHalfW: { value: 0.8 }, uMinPx: { value: 3.2 }, uResY: { value: res.y },
    },
    vertexShader: /* glsl */`
      attribute vec3 aTangent;
      attribute float aSide, aSig, aS;
      uniform float uHalfW, uMinPx, uResY;
      varying float vSide, vSig, vS, vEnergy;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec3 t = normalize((modelViewMatrix * vec4(aTangent, 0.0)).xyz);
        vec3 side = cross(t, normalize(-mv.xyz));
        float l = length(side);
        side = l > 1e-4 ? side / l : vec3(0.0, 1.0, 0.0);
        float wpp = 2.0 * (-mv.z) / (projectionMatrix[1][1] * uResY);   // world size of one drawing-buffer pixel
        float hw = max(uHalfW, uMinPx * wpp);
        mv.xyz += side * hw * aSide;
        vSide = aSide; vSig = aSig; vS = aS; vEnergy = uHalfW / hw;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      varying float vSide, vSig, vS, vEnergy;
      ${common}
      void main() {
        float x = vSide;
        float core = exp(-x * x / (2.0 * 0.22 * 0.22));
        float halo = exp(-x * x / (2.0 * 0.5 * 0.5)) * (1.0 - x * x);
        float k = lightAt(vSig, vS) * vEnergy * uGain;
        gl_FragColor = vec4(uColor * k * (core * 1.0 + halo * 0.18), 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });

  const spillMat = (th, row) => new THREE.ShaderMaterial({
    uniforms: {
      uSig: { value: sigTex }, uRow: { value: (row + 0.5) / NT }, uTime: { value: 0 }, uHead: { value: -1 }, uLag: { value: th.lag },
      uSigEnd: { value: sigOf(th.L) }, uLen: { value: th.L }, uGain: { value: 1 }, uColor: { value: warm.clone() },
    },
    vertexShader: /* glsl */`
      attribute float aSide, aSig, aS;
      varying float vSide, vSig, vS;
      void main() { vSide = aSide; vSig = aSig; vS = aS; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor;
      varying float vSide, vSig, vS;
      ${common}
      void main() {
        float x = vSide;
        float p = exp(-x * x * 5.0) * (1.0 - x * x);
        gl_FragColor = vec4(uColor * p * lightAt(vSig, vS) * uGain, 1.0);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });

  const Y = 0.9;            // the fibre lies just above the floor
  const items = [];
  threads.forEach((th, row) => {
    // sample the Bezier densely, measure arc length, then resample uniformly in σ
    const bez = new THREE.CubicBezierCurve(th.P0, th.P1, th.P2, th.P3);
    const dense = bez.getSpacedPoints(4000);
    const acc = [0];
    for (let j = 1; j < dense.length; j++) acc.push(acc[j - 1] + dense[j].distanceTo(dense[j - 1]));
    const total = acc[acc.length - 1];
    const ph = 0.6 + (R() - 0.5) * 0.5, amp = 0.85 + R() * 0.3;
    // gentle curves in the near and middle distance; straight, converging runs far away (no squiggles at the horizon)
    const meander = (s) => amp * 30 * Math.sin(s / 640 + ph) * smooth(s / 300) * (1 - smooth((s - 2200) / 2600));
    const at = (s) => {
      s = clamp(s, 0, total);
      let lo = 0, hi = acc.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (acc[m] < s) lo = m; else hi = m; }
      const f = (s - acc[lo]) / Math.max(1e-6, acc[hi] - acc[lo]);
      const p = dense[lo].clone().lerp(dense[hi], f);
      const tg = dense[hi].clone().sub(dense[lo]).normalize();
      const nrm = new THREE.Vector2(-tg.y, tg.x);
      return p.addScaledVector(nrm, meander(s));
    };
    const N = 900, sigEnd = sigOf(Math.min(th.L, total));
    const pts = [], ss = [], sg = [];
    for (let j = 0; j <= N; j++) { const sig = sigEnd * j / N; const s = sOf(sig); sg.push(sig); ss.push(s); pts.push(at(s)); }

    const pos = [], tan = [], side = [], asig = [], as = [], idx = [];
    const spos = [], sside = [], ssig = [], sas = [];
    for (let j = 0; j <= N; j++) {
      const a = pts[Math.max(0, j - 1)], b = pts[Math.min(N, j + 1)];
      const tg = b.clone().sub(a).normalize();
      for (const sd of [-1, 1]) {
        pos.push(pts[j].x, Y, pts[j].y); tan.push(tg.x, 0, tg.y); side.push(sd); asig.push(sg[j]); as.push(ss[j]);
        const W = 9 + 0.012 * ss[j];                   // floor spill widens a little with distance
        spos.push(pts[j].x - tg.y * W * sd, 0.05, pts[j].y + tg.x * W * sd); sside.push(sd); ssig.push(sg[j]); sas.push(ss[j]);
      }
      if (j < N) { const q = 2 * j; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aTangent', new THREE.Float32BufferAttribute(tan, 3));
    g.setAttribute('aSide', new THREE.Float32BufferAttribute(side, 1));
    g.setAttribute('aSig', new THREE.Float32BufferAttribute(asig, 1));
    g.setAttribute('aS', new THREE.Float32BufferAttribute(as, 1));
    g.setIndex(idx);
    const line = new THREE.Mesh(g, threadMat(th, row));
    line.frustumCulled = false; line.renderOrder = 6;
    scene.add(line);

    const sgeo = new THREE.BufferGeometry();
    sgeo.setAttribute('position', new THREE.Float32BufferAttribute(spos, 3));
    sgeo.setAttribute('aSide', new THREE.Float32BufferAttribute(sside, 1));
    sgeo.setAttribute('aSig', new THREE.Float32BufferAttribute(ssig, 1));
    sgeo.setAttribute('aS', new THREE.Float32BufferAttribute(sas, 1));
    sgeo.setIndex(idx);
    const spill = new THREE.Mesh(sgeo, spillMat(th, row));
    spill.frustumCulled = false; spill.renderOrder = 5;
    spill.material.uniforms.uGain.value = 0.16;
    scene.add(spill);
    items.push({ th, line, spill });
  });

  // ------------------------------------------------------------------ camera: one continuous pull back and rise
  // The camera orbits an anchor on the device (azimuth from +z toward −x, elevation, distance) and is then turned by a
  // small yaw/pitch offset, so the device's place in the frame is set directly: centred at first, lower-left at the end,
  // with the threads running up and away to the right.
  camera.fov = 26; camera.near = 4; camera.far = 20000; camera.updateProjectionMatrix();   // threads run ~10 m out
  const D = new THREE.Vector3(-4, 7, 1);
  const C0 = { dist: 168, az: 0.70, el: 0.75, yaw: 0.0, pitch: 0.0 };
  const C1 = { dist: 780, az: 0.62, el: 0.32, yaw: 0.16, pitch: 0.115 };
  const camEase = (x) => { const t = clamp(x); return t * t * t * (t * (6 * t - 15) + 10); };   // smootherstep
  const look = new THREE.Vector3();

  return {
    update(t) {
      const k = camEase(t / duration);
      const dist = Math.exp(lerp(Math.log(C0.dist), Math.log(C1.dist), k));
      const az = lerp(C0.az, C1.az, k), el = lerp(C0.el, C1.el, k);
      camera.position.set(D.x - Math.sin(az) * Math.cos(el) * dist, D.y + Math.sin(el) * dist, D.z + Math.cos(az) * Math.cos(el) * dist);
      look.copy(D).sub(camera.position).normalize();
      const ko = camEase((t - 0.6) / (duration - 0.6));
      const yaw = Math.atan2(look.x, -look.z) + lerp(C0.yaw, C1.yaw, ko);
      const pitch = Math.asin(look.y) + lerp(C0.pitch, C1.pitch, ko);
      look.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
      camera.lookAt(camera.position.x + look.x, camera.position.y + look.y, camera.position.z + look.z);

      // fade in from black over the first half second
      const f = ramp(t, 0.0, 0.55);
      renderer.toneMappingExposure = baseExposure * f * f;

      // the hidden sensor wakes under the implied thumb
      const touch = ramp(t, 0.8, 1.35);
      device.anim.setTouch(touch * (1 + 0.04 * Math.sin(Math.max(0, t - 1.35) * 2.2)));

      // the slit comes to an idle glow, then speaks
      const idle = 0.28 * ramp(t, 0.95, 1.4);
      device.anim.setSlit(idle + 1.05 * speech(t) * ramp(t, 1.38, 1.5));

      for (const { th, line, spill } of items) {
        const head = t - th.t0;
        for (const m of [line.material, spill.material]) {
          m.uniforms.uTime.value = t - th.lag;
          m.uniforms.uHead.value = head;
        }
        line.visible = spill.visible = head > -0.05;
      }
    },
  };
}
