// Shot 2: noise, heads down. A dark void fills with glowing notification cards: blank rounded rectangles with an
// icon circle and grey bars, never text. They pop in faster and faster at every depth while the camera eases back to
// show the pile, then everything falls away and dissolves downward into black (fully black before 4.2 s).
// No device, no floor, no studio light: every card is self-lit, with a cheap depth of field from pre-blurred textures.
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { clamp, lerp, ramp, track, smooth } from '../lib/anim.js';

export const duration = 4.5;
export const device = false;

const N = 230;            // cards
const FALL = 3.12;        // everything starts to fall away
const TW = 1024, TH = 512, CARD_PX = 800, PX_PER_UNIT = CARD_PX / 360; // a card is 360 units wide
const LEVELS = [0, 7, 18, 40];                                         // blur sigma per texture level, in texture px

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function bar(g, x, y, w, h, color) { g.fillStyle = color; roundRect(g, x, y - h / 2, w, h, h / 2); g.fill(); }

// One generic notification: a frosted cool-white card, an icon circle and 2–3 grey bars. No glyphs anywhere.
function drawCard(v) {
  const c = document.createElement('canvas'); c.width = TW; c.height = TH;
  const g = c.getContext('2d');
  const h = v.lines === 3 ? 232 : 182, w = CARD_PX, x = (TW - w) / 2, y = (TH - h) / 2, r = 50;
  // soft screen glow around the card
  g.save();
  g.shadowColor = 'rgba(206, 216, 228, 0.55)'; g.shadowBlur = 70;
  g.fillStyle = 'rgba(200, 210, 222, 0.35)'; roundRect(g, x + 6, y + 6, w - 12, h - 12, r); g.fill();
  g.restore();
  // body
  const body = g.createLinearGradient(0, y, 0, y + h);
  body.addColorStop(0, 'rgba(236, 240, 244, 0.93)'); body.addColorStop(1, 'rgba(212, 218, 225, 0.9)');
  g.fillStyle = body; roundRect(g, x, y, w, h, r); g.fill();
  g.strokeStyle = 'rgba(255, 255, 255, 0.7)'; g.lineWidth = 3; roundRect(g, x + 1.5, y + 1.5, w - 3, h - 3, r - 1.5); g.stroke();
  // icon circle
  const cr = 46, cx = x + 44 + cr, cy = y + h / 2;
  const ic = g.createLinearGradient(0, cy - cr, 0, cy + cr);
  ic.addColorStop(0, '#b4bac1'); ic.addColorStop(1, '#959ca4');
  g.fillStyle = ic; g.beginPath(); g.arc(cx, cy, cr, 0, Math.PI * 2); g.fill();
  // bars: a darker title, lighter body lines, sometimes a short time stamp at the right
  const bx = cx + cr + 40, bh = 24, gap = v.lines === 3 ? 52 : 50;
  const y0 = cy - gap * (v.lines - 1) / 2;
  bar(g, bx, y0, v.title, bh, '#7c838b');
  if (v.stamp) bar(g, x + w - 44 - 64, y0, 64, bh * 0.8, '#b9bfc6');
  for (let i = 1; i < v.lines; i++) bar(g, bx, y0 + gap * i, v.body[i - 1], bh, '#a9b0b8');
  return c;
}

function blurred(src, sigma) {
  if (!sigma) return src;
  const c = document.createElement('canvas'); c.width = TW; c.height = TH;
  const g = c.getContext('2d'); g.filter = `blur(${sigma}px)`; g.drawImage(src, 0, 0);
  return c;
}

const VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
// Mix between the two nearest pre-blurred levels in premultiplied space; output premultiplied linear HDR.
const FRAG = /* glsl */`
uniform sampler2D t0; uniform sampler2D t1; uniform sampler2D t2; uniform sampler2D t3;
uniform float blur; uniform float opacity; uniform float gain;
varying vec2 vUv;
vec4 pm(vec4 c) { return vec4(c.rgb * c.a, c.a); }
void main() {
  float b = clamp(blur, 0.0, 3.0);
  vec4 c;
  if (b < 1.0) c = mix(pm(texture2D(t0, vUv)), pm(texture2D(t1, vUv)), b);
  else if (b < 2.0) c = mix(pm(texture2D(t1, vUv)), pm(texture2D(t2, vUv)), b - 1.0);
  else c = mix(pm(texture2D(t2, vUv)), pm(texture2D(t3, vUv)), b - 2.0);
  gl_FragColor = vec4(c.rgb * gain, c.a) * opacity;
}`;

export function setup({ THREE, stage }) {
  const { scene, camera, renderer, composer, lights } = stage;
  // a pure void: no floor, no studio backdrop or reflections, no lights
  stage.floor.visible = false;
  scene.background = new THREE.Color(0x000000);
  scene.environment = null; scene.fog = null;
  for (const l of Object.values(lights)) l.visible = false;

  // 8-bit dither after the output transform, so the soft glows don't band (pure black stays black)
  const dither = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, seed: { value: 0 } },
    vertexShader: VERT,
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse; uniform float seed; varying vec2 vUv;
      float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + seed) * 43758.5453); }
      void main() {
        vec4 c = texture2D(tDiffuse, vUv);
        float n = h(gl_FragCoord.xy) + h(gl_FragCoord.xy + 17.17) - 1.0;
        vec2 v = (vUv - 0.5) * vec2(1.0, 0.75);
        c.rgb *= 1.0 - 0.9 * dot(v, v);  // a gentle optical vignette
        c.rgb += n / 255.0 * smoothstep(0.0, 4.0 / 255.0, max(c.r, max(c.g, c.b)));
        gl_FragColor = c;
      }`,
  });
  composer.addPass(dither);

  const rand = mulberry32(20261016);
  const R = (a, b) => lerp(a, b, rand());

  // card designs: 2- or 3-line, varied bar lengths; each pre-blurred at four levels
  const designs = [
    { lines: 2, title: 230, body: [470], stamp: true },
    { lines: 3, title: 290, body: [520, 380], stamp: true },
    { lines: 2, title: 330, body: [400], stamp: false },
    { lines: 3, title: 200, body: [540, 470], stamp: false },
    { lines: 2, title: 260, body: [540], stamp: true },
    { lines: 3, title: 340, body: [460, 300], stamp: true },
  ];
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const variants = designs.map((d) => {
    const base = drawCard(d);
    return LEVELS.map((s) => {
      const t = new THREE.CanvasTexture(blurred(base, s));
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
      t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
      return t;
    });
  });
  const plane = new THREE.PlaneGeometry(TW / PX_PER_UNIT, TH / PX_PER_UNIT);

  // camera: one slow pull back from a single card to the whole pile, easing in and out
  camera.fov = 32; camera.near = 10; camera.far = 20000; camera.updateProjectionMatrix();
  const camKeys = [{ t: 0, v: [26, 8, 640] }, { t: duration, v: [-70, 70, 2500] }];
  const lookKeys = [{ t: 0, v: [8, 2, 0] }, { t: duration, v: [-10, 10, 0] }];
  const ghost = camera.clone();
  const pose = (t, cam) => { cam.position.set(...track(camKeys, t)); cam.lookAt(...track(lookKeys, t)); cam.updateMatrixWorld(true); return cam; };
  const fwd = new THREE.Vector3(), dir = new THREE.Vector3(), tmp = new THREE.Vector3();

  // arrivals accelerate exponentially: 1 card at 0.2 s, ~6 by 1.2 s, ~40 by 2.2 s, all by ~3.1 s
  const spawnAt = (i) => (i === 0 ? 0.2 : 0.2 + Math.log(i / 0.685 + 1) / 2);

  const cards = [];
  const ghostF = pose(FALL, camera.clone());
  const placed = []; // screen-space footprints at spawn, for keeping the first few apart
  for (let i = 0; i < N; i++) {
    const t0 = spawnAt(i);
    pose(t0, ghost);
    ghost.getWorldDirection(fwd);
    const f = ghost.position.distanceTo(new THREE.Vector3(...track(lookKeys, t0)));
    // relative depth: the first cards sit near focus, later ones scatter in front and far behind
    let rel, sx, sy;
    if (i === 0) { rel = 1; sx = 0; sy = 0.02; } else {
      for (let tries = 0; tries < 40; tries++) {
        rel = i < 6 ? R(0.8, 1.35) : Math.exp(R(-0.36, 0.85));
        rel = clamp(rel, 0.6, 2.2);
        sx = R(-1.04, 1.04); sy = R(-1.0, 1.0);
        const size = 0.75 / rel; // rough on-screen card size relative to the first card
        const minGap = i < 40 ? 0.42 * size : 0;
        if (placed.every((p) => Math.hypot((p.x - sx) * 1.6, p.y - sy) > minGap + 0.3 * p.s * (i < 12 ? 1 : 0.3))) break;
      }
    }
    placed.push({ x: sx, y: sy, s: 0.75 / rel });
    dir.set(sx, sy, 0.5).unproject(ghost).sub(ghost.position).normalize();
    const d = f * rel;
    const pos = ghost.position.clone().addScaledVector(dir, d / dir.dot(fwd));

    const mat = new THREE.ShaderMaterial({
      uniforms: { t0: { value: null }, t1: { value: null }, t2: { value: null }, t3: { value: null }, blur: { value: 0 }, opacity: { value: 0 }, gain: { value: 1 } },
      vertexShader: VERT, fragmentShader: FRAG,
      transparent: true, depthWrite: false, premultipliedAlpha: true,
    });
    const tex = variants[i === 0 ? 1 : Math.floor(rand() * variants.length)];
    tex.forEach((tx, k) => { mat.uniforms[`t${k}`].value = tx; });
    const mesh = new THREE.Mesh(plane, mat);
    mesh.position.copy(pos);
    mesh.quaternion.copy(ghost.quaternion);
    const rot = new THREE.Euler(i === 0 ? -0.06 : R(-0.24, 0.24), i === 0 ? 0.1 : R(-0.36, 0.36), i === 0 ? 0 : R(-0.07, 0.07));
    mesh.quaternion.multiply(new THREE.Quaternion().setFromEuler(rot));
    mesh.visible = false;
    scene.add(mesh);
    cards.push({
      mesh, mat, t0, pos, q: mesh.quaternion.clone(),
      bright: i === 0 ? 0.56 : R(0.36, 0.6),
      // the top of the pile lets go first, so the dark comes down from above; a little randomness on top
      fall: FALL + 0.26 * clamp((1 - pos.clone().project(ghostF).y) / 2) + R(0, 0.08),
      spin: R(-0.5, 0.9),
    });
  }

  // a fixed back-to-front draw order (the camera looks down -z), so overlapping cards never swap while it moves
  [...cards].sort((a, b) => a.pos.z - b.pos.z).forEach((c, k) => { c.mesh.renderOrder = k; });

  // a faint cool glow behind the pile that grows with it: the light of all those screens in the dark
  const glowMat = new THREE.ShaderMaterial({
    uniforms: { k: { value: 0 } },
    vertexShader: VERT,
    fragmentShader: /* glsl */`
      uniform float k; varying vec2 vUv;
      void main() { vec2 p = (vUv - 0.5) * vec2(1.78, 1.0); float r = length(p) * 2.0;
        gl_FragColor = vec4(vec3(0.78, 0.82, 0.87) * k * exp(-r * r * 2.2), 1.0); }`,
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true,
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(16000, 9000), glowMat);
  glow.position.set(0, 0, -5000); glow.renderOrder = -1;
  scene.add(glow);

  const level = (sigmaUnits) => {
    const s = sigmaUnits * PX_PER_UNIT;
    for (let k = 1; k < LEVELS.length; k++) if (s < LEVELS[k]) return k - 1 + (s - LEVELS[k - 1]) / (LEVELS[k] - LEVELS[k - 1]);
    return LEVELS.length - 1;
  };
  const APERTURE = 38; // world units: the lens' entrance pupil, for the depth of field
  const fall = new THREE.Quaternion(), axis = new THREE.Vector3(1, 0, 0);

  return {
    update(t) {
      pose(t, camera);
      camera.getWorldDirection(fwd);
      const focus = camera.position.distanceTo(tmp.set(...track(lookKeys, t)));
      const fadeAll = 1 - ramp(t, 3.7, 4.06);
      let lit = 0;

      for (const c of cards) {
        const age = t - c.t0;
        if (age < 0) { c.mesh.visible = false; continue; }
        const tau = Math.max(0, t - c.fall);
        const gone = smooth((tau - 0.1) / 0.55);
        if (gone >= 1 || fadeAll <= 0) { c.mesh.visible = false; continue; }
        c.mesh.visible = true;

        // pop in: a quick ease-out scale with a hint of overshoot, a short brightening and a focus snap
        const k = clamp(age / 0.26);
        const pop = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2);
        const scale = lerp(0.86, 1, pop);
        const flash = 1 + 0.4 * Math.exp(-age * 8);

        // fall away: accelerate downward, tip back, defocus and fade into the dark
        c.mesh.position.copy(c.pos);
        c.mesh.position.y -= 1900 * tau * tau + 120 * tau;
        c.mesh.quaternion.copy(c.q).multiply(fall.setFromAxisAngle(axis, c.spin * tau * tau * 1.4));
        c.mesh.scale.setScalar(scale);

        const d = tmp.copy(c.mesh.position).sub(camera.position).dot(fwd);
        const rel = d / focus;
        const sigma = 0.45 * APERTURE * Math.abs(d - focus) / focus;
        c.mat.uniforms.blur.value = level(sigma) + 1.2 * Math.exp(-age * 12) + 0.9 * gone;
        // nearer cards glow a little brighter, deep ones sink into the void
        const depthGain = rel < 0.85 ? lerp(0.75, 1, clamp((rel - 0.6) / 0.25)) : clamp(Math.exp(-1.7 * (rel - 0.85)), 0.06, 1);
        c.mat.uniforms.gain.value = c.bright * depthGain * flash * fadeAll;
        c.mat.uniforms.opacity.value = smooth(age / 0.12) * (1 - gone) * lerp(0.5, 1, clamp((rel - 0.6) / 0.25));
        lit += 1 - gone;
      }

      glowMat.uniforms.k.value = 0.032 * Math.sqrt(lit / N) * fadeAll;
      dither.uniforms.seed.value = (t * 30) % 17;
    },
  };
}
