// Shot 6 · desk: come back to finished work. A dark study at dusk. A large thin-bezel monitor on a walnut desk shows
// a calm, dark one-page brief; the device lies beside the keyboard, its slit off. Behind, a tall window onto city lights
// far below, out of focus. A warm desk lamp off frame lays a soft pool across the desk. One slow push toward the screen.
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { track, clamp } from '../lib/anim.js';

export const duration = 3.5;

// study layout (mm). The desk top is y = 0; the window wall faces +z.
const WALLZ = -640;                          // window wall
const DZ0 = -620, DZ1 = 430;                 // desk back / front edge
const SX = -30, SY = 305, SZ = -330;         // screen centre (front face of the panel)
const SW = 708, SH = 398;                    // active area of a 32-inch panel
const HORIZON = 540;                         // eye level on the far city plane
const CITYZ = -5200;

export async function setup({ THREE, stage, device, ctx }) {
  const { scene, camera, lights, renderer } = stage;
  scene.fog = null;
  scene.background = new THREE.Color(0x000000);
  stage.floor.visible = false;
  RectAreaLightUniformsLib.init();

  await document.fonts.load('600 64px Inter');
  await document.fonts.load('400 40px Inter');

  // ------------------------------------------------------------------ small noise helpers for canvas textures
  const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
  const vnoise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const fbm = (x, y, o = 4) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * vnoise(x * f, y * f); a *= 0.5; f *= 2.03; } return s; };
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  // ±1 LSB of noise so the dark gradients never band
  const dither = (g, W, H, amp = 1.6) => {
    const img = g.getImageData(0, 0, W, H), px = img.data;
    for (let i = 0; i < px.length; i += 4) { const n = (hash(i, 17) - 0.5) * amp; px[i] += n; px[i + 1] += n; px[i + 2] += n; }
    g.putImageData(img, 0, 0);
  };
  const canvasTexture = (c) => {
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t;
  };

  // ------------------------------------------------------------------ the brief on the monitor
  function briefTexture() {
    const W = 2560, H = 1440, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    // one calm dark page filling the panel, a touch lighter at the top
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#18181a'); bg.addColorStop(1, '#121214');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);

    const TITLE = '600 150px Inter', LABEL = '600 58px Inter', ITEM = '400 88px Inter';
    const IND = 124;                                   // text indent after the check marks
    const done = ['Prototype built and running', 'Pitch deck \u2014 12 slides', 'Pricing charts'];
    const decide = 'Choose the pricing tier';
    g.font = TITLE; const tw = g.measureText('While you were away').width;
    g.font = ITEM; const iw = Math.max(...[...done, decide].map((s) => g.measureText(s).width)) + IND;
    const bw = Math.max(tw, iw), x0 = Math.round((W - bw) / 2);
    g.textBaseline = 'alphabetic';

    g.font = TITLE; g.fillStyle = '#f2eee7'; g.fillText('While you were away', x0, 345);
    g.fillStyle = '#2a2a2e'; g.fillRect(x0, 432, bw, 3);

    const label = (s, y) => { g.font = LABEL; g.fillStyle = '#8f8b84'; g.fillText(s, x0, y); };
    const item = (s, y) => { g.font = ITEM; g.fillStyle = '#e7e3db'; g.fillText(s, x0 + IND, y); };
    const check = (y) => {
      const cx = x0 + 36, cy = y - 32, r = 34;
      g.lineWidth = 4.5; g.strokeStyle = '#55524d'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
      g.lineWidth = 7.5; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#ece7df';
      g.beginPath(); g.moveTo(cx - r * 0.42, cy + r * 0.02); g.lineTo(cx - r * 0.12, cy + r * 0.33); g.lineTo(cx + r * 0.44, cy - r * 0.3); g.stroke();
    };
    label('Done', 565);
    done.forEach((s, i) => { const y = 695 + i * 126; check(y); item(s, y); });
    label('Needs your decision', 1085);
    {
      const y = 1215, cx = x0 + 36, cy = y - 32;
      g.fillStyle = 'rgba(226,164,72,0.16)'; g.beginPath(); g.arc(cx, cy, 30, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#e0a44c'; g.beginPath(); g.arc(cx, cy, 16, 0, Math.PI * 2); g.fill();
      item(decide, y);
    }
    dither(g, W, H, 1.2);
    return canvasTexture(c);
  }

  // ------------------------------------------------------------------ the city at dusk, far below and out of focus
  const CW = 12000, CH = 5000, CY0 = -1600;    // far plane extent (mm) and its bottom edge
  function cityTexture() {
    const W = 4096, H = Math.round(W * CH / CW), c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const hy = Math.round((1 - (HORIZON - CY0) / CH) * H);   // horizon row
    // dusk: deep slate overhead, the last of the light a warm grey along the horizon
    const sky = g.createLinearGradient(0, 0, 0, hy);
    sky.addColorStop(0, '#0a0b0e'); sky.addColorStop(0.5, '#131519'); sky.addColorStop(0.82, '#25272c'); sky.addColorStop(1, '#45403a');
    g.fillStyle = sky; g.fillRect(0, 0, W, hy);
    const ground = g.createLinearGradient(0, hy, 0, H);
    ground.addColorStop(0, '#45403a'); ground.addColorStop(0.04, '#2c2925'); ground.addColorStop(0.12, '#191715'); ground.addColorStop(0.45, '#0e0d0d'); ground.addColorStop(1, '#070708');
    g.fillStyle = ground; g.fillRect(0, hy, W, H - hy);
    // a far skyline, out of focus: soft towers just darker than the sky
    g.filter = 'blur(14px)';
    g.fillStyle = 'rgba(16,16,18,0.8)';
    const towers = [];
    for (let x = -60; x < W;) {
      const w = 50 + rand() * 150, h = 20 + Math.pow(rand(), 2.4) * 300;
      g.fillRect(x, hy - h, w, h + 30); towers.push([x, w, h]); x += w + rand() * 60;
    }
    g.filter = 'none';
    // bokeh: every light is far beyond focus, so the discs are all about the same size
    g.globalCompositeOperation = 'lighter';
    const tints = [[255, 240, 222], [255, 232, 205], [246, 240, 232], [255, 222, 186], [236, 236, 238]];
    const disc = (x, y, r, a, tint) => {
      const [cr, cg, cb] = tint;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, `rgba(${cr},${cg},${cb},${a * 0.78})`);
      grd.addColorStop(0.8, `rgba(${cr},${cg},${cb},${a})`);
      grd.addColorStop(0.93, `rgba(${cr},${cg},${cb},${a * 0.5})`);
      grd.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    };
    // lit windows in the towers
    for (const [x, w, h] of towers) {
      if (h < 90) continue;
      const n = Math.floor(h / 70 * rand());
      for (let i = 0; i < n; i++) disc(x + rand() * w, hy - rand() * h * 0.9, 19 + rand() * 4, 0.07 + Math.pow(rand(), 2) * 0.3, tints[Math.floor(rand() * tints.length)]);
    }
    // the city spread out below: dense toward the horizon, thinning as it comes nearer
    for (let i = 0; i < 560; i++) {
      const x = 600 + rand() * 2500;                                     // only this band is ever seen through the window
      const y = hy + 6 + Math.pow(rand(), 1.5) * (H - hy) * 0.85;
      const dens = clamp(fbm(x * 0.003, y * 0.006, 3) * 1.6 - 0.3);      // brighter districts, quieter gaps
      const near = clamp((y - hy) / (H - hy));
      const r = (19 + rand() * 5) * (1 + near * 0.45);
      const a = (0.04 + Math.pow(rand(), 2.4) * 0.3) * (0.35 + 0.9 * dens) * (1 - near * 0.5);
      disc(x, y, r, a, tints[Math.floor(rand() * tints.length)]);
    }
    g.globalCompositeOperation = 'source-over';
    dither(g, W, H, 1.8);
    return canvasTexture(c);
  }

  // dark walnut, oiled and lacquered: long grain along x, a slow cathedral figure, fine pores
  const DL = 1900, DD = DZ1 - DZ0;
  function walnutTexture() {
    const W = 3072, H = 1536, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), img = g.createImageData(W, H), px = img.data;
    const dark = [42, 28, 19], mid = [82, 57, 39], light = [120, 86, 60];
    for (let j = 0; j < H; j++) {
      const v = j / H * DD;
      for (let i = 0; i < W; i++) {
        const u = i / W * DL;
        const warp = (fbm(u * 0.0016, v * 0.012, 3) - 0.5) * 70 + Math.sin(u * 0.0031 + v * 0.011) * 9;
        const w = v + warp;
        const band = 0.5 + 0.5 * Math.sin(w * 0.31 + fbm(u * 0.004, v * 0.05, 2) * 9) * (0.6 + 0.4 * Math.sin(w * 0.071 + u * 0.002));
        const figure = fbm(u * 0.0011 + 7, w * 0.03, 3);
        const streak = fbm(u * 0.0008, w * 0.22, 3);                     // fine, uneven grain lines
        const pores = vnoise(u * 0.09, w * 1.6) * vnoise(u * 0.035 + 3, w * 0.9);
        const k = clamp(0.12 + 0.46 * figure + 0.18 * Math.pow(band, 3) + 0.22 * streak - 0.22 * Math.pow(pores, 2));
        const col = k < 0.5 ? dark.map((d, n) => d + (mid[n] - d) * (k / 0.5)) : mid.map((m, n) => m + (light[n] - m) * ((k - 0.5) / 0.5));
        const o = 4 * (j * W + i);
        px[o] = col[0]; px[o + 1] = col[1]; px[o + 2] = col[2]; px[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return canvasTexture(c);
  }

  // ------------------------------------------------------------------ environment: the dark study itself, for reflections
  {
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x101012).multiplyScalar(0.6), side: THREE.BackSide })));
    const add = (w, h, color, k, pos) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide }));
      m.position.set(...pos); m.lookAt(0, 0, 0); env.add(m); return m;
    };
    add(16, 7, 0x9fa3a9, 0.09, [0, 2.6, -8]);        // the dusk window behind the desk
    add(4.2, 2.4, 0xe9e6e0, 0.1, [0, 1.2, -5]);       // the monitor (a dark page: little light)
    add(1.6, 1.6, 0xffe9d0, 2.2, [-4.5, 6.5, 3.5]);   // the desk lamp, up and to the left
    add(18, 18, 0x050505, 1, [0, -9.5, 0]);           // dark floor
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(env, 0.03).texture;
    pmrem.dispose();
    scene.environmentIntensity = 0.7;
  }

  // ------------------------------------------------------------------ lights
  // the stage key and fill are off; a warm desk lamp off frame (left, high, in front) lays a soft pool on the desk
  lights.key.intensity = 0; lights.key.castShadow = false;
  lights.fill.intensity = 0;
  const lamp = new THREE.SpotLight(0xffeedd, 3.4, 0, 0.33, 1.0, 0);
  lamp.position.set(-820, 1200, 40); lamp.target.position.set(110, 0, -90);
  lamp.castShadow = true; lamp.shadow.mapSize.set(2048, 2048);
  lamp.shadow.camera.near = 300; lamp.shadow.camera.far = 3000;
  lamp.shadow.bias = -0.00012; lamp.shadow.normalBias = 0.2; lamp.shadow.radius = 3;
  scene.add(lamp, lamp.target);
  // dusk through the window: a faint, slightly cool rim from behind
  lights.rim.color.set(0xe4e8ee); lights.rim.intensity = 0.25; lights.rim.position.set(-900, 2000, -1800);   // high, so the polished tops don't mirror it
  lights.hemi.color.set(0xd8dce2); lights.hemi.groundColor.set(0x000000); lights.hemi.intensity = 0.05;
  // the screen's own glow on the desk, keys and device
  const glow = new THREE.RectAreaLight(0xece9e3, 0.1, SW, SH);
  glow.position.set(SX, SY, SZ + 1); glow.lookAt(SX, SY, SZ + 1000);
  scene.add(glow);

  const shadowed = (m, cast = true, receive = true) => { m.castShadow = cast; m.receiveShadow = receive; return m; };

  // ------------------------------------------------------------------ the window wall and the city beyond
  const WIN = { x0: -980, x1: 900, y0: 40, y1: 2600 };
  {
    const s = new THREE.Shape();
    s.moveTo(-4000, -900); s.lineTo(4000, -900); s.lineTo(4000, 3200); s.lineTo(-4000, 3200); s.closePath();
    const h = new THREE.Path(); h.moveTo(WIN.x0, WIN.y0); h.lineTo(WIN.x0, WIN.y1); h.lineTo(WIN.x1, WIN.y1); h.lineTo(WIN.x1, WIN.y0); h.closePath();
    s.holes.push(h);
    const wall = shadowed(new THREE.Mesh(new THREE.ShapeGeometry(s), new THREE.MeshPhysicalMaterial({ color: 0x1c1b1a, roughness: 0.92 })), false);
    wall.position.z = WALLZ; scene.add(wall);
    // slim blackened-steel frame: jambs, sill and one mullion
    const steel = new THREE.MeshPhysicalMaterial({ color: 0x0d0d0e, metalness: 0.7, roughness: 0.42 });
    const bar = (w, h, x, y) => { const m = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w, h, 70), steel)); m.position.set(x, y, WALLZ - 40); scene.add(m); };
    bar(46, WIN.y1 - WIN.y0, WIN.x0 + 23, (WIN.y0 + WIN.y1) / 2);
    bar(46, WIN.y1 - WIN.y0, WIN.x1 - 23, (WIN.y0 + WIN.y1) / 2);
    bar(WIN.x1 - WIN.x0, 46, (WIN.x0 + WIN.x1) / 2, WIN.y0 + 23);
    // the reveal returns: dark plaster depth around the opening
    const ret = new THREE.MeshPhysicalMaterial({ color: 0x161514, roughness: 0.95, side: THREE.DoubleSide });
    const side = (x) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(120, WIN.y1 - WIN.y0), ret); m.rotation.y = Math.PI / 2; m.position.set(x, (WIN.y0 + WIN.y1) / 2, WALLZ - 60); scene.add(m); };
    side(WIN.x0); side(WIN.x1);
    const sill = new THREE.Mesh(new THREE.PlaneGeometry(WIN.x1 - WIN.x0, 120), ret); sill.rotation.x = -Math.PI / 2; sill.position.set((WIN.x0 + WIN.x1) / 2, WIN.y0, WALLZ - 60); scene.add(sill);
    // the glass: barely there, a faint sheen
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(WIN.x1 - WIN.x0, WIN.y1 - WIN.y0), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.04, roughness: 0.1, depthWrite: false }));
    glass.position.set((WIN.x0 + WIN.x1) / 2, (WIN.y0 + WIN.y1) / 2, WALLZ - 40); scene.add(glass);
    // the city
    const city = new THREE.Mesh(new THREE.PlaneGeometry(CW, CH), new THREE.MeshBasicMaterial({ map: cityTexture(), color: new THREE.Color(1, 1, 1).multiplyScalar(1.15) }));
    city.position.set(0, CY0 + CH / 2, CITYZ); scene.add(city);
  }

  // ------------------------------------------------------------------ the desk
  {
    const g = new ctx.RoundedBoxGeometry(DL, 32, DD, 4, 6);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / DL + 0.5, 1 - (p.getZ(i) / DD + 0.5));
    const walnut = new THREE.MeshPhysicalMaterial({ map: walnutTexture(), roughness: 0.7, specularIntensity: 0.16, clearcoat: 0.12, clearcoatRoughness: 0.42, envMapIntensity: 0.9 });
    const top = shadowed(new THREE.Mesh(g, walnut), false);
    top.position.set(0, -16, (DZ0 + DZ1) / 2); scene.add(top);
  }

  // ------------------------------------------------------------------ the monitor: a thin graphite slab, black glass, slim stand
  {
    const graphite = new THREE.MeshPhysicalMaterial({ color: 0x2a2b2e, metalness: 0.85, roughness: 0.38 });
    const glassBlack = new THREE.MeshPhysicalMaterial({ color: 0x030304, metalness: 0, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.04 });
    const BW = SW + 16, BH = SH + 16, BD = 14;
    const body = shadowed(new THREE.Mesh(new ctx.RoundedBoxGeometry(BW, BH, BD, 4, 4), graphite));
    body.position.set(SX, SY, SZ - BD / 2 - 1.2); scene.add(body);
    const front = shadowed(new THREE.Mesh(new ctx.RoundedBoxGeometry(BW - 1.5, BH - 1.5, 1.2, 2, 0.6), glassBlack));
    front.position.set(SX, SY, SZ - 0.9); scene.add(front);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), new THREE.MeshBasicMaterial({ map: briefTexture(), color: new THREE.Color(1, 1, 1).multiplyScalar(1.12) }));
    screen.position.set(SX, SY, SZ - 0.15); scene.add(screen);
    // stand: a slim neck behind the panel and a thin foot on the desk
    const neck = shadowed(new THREE.Mesh(new ctx.RoundedBoxGeometry(72, 330, 12, 3, 4), graphite));
    neck.position.set(SX, 165, SZ - 70); neck.rotation.x = -0.16; scene.add(neck);
    const foot = shadowed(new THREE.Mesh(new ctx.RoundedBoxGeometry(230, 6, 170, 3, 2.5), new THREE.MeshPhysicalMaterial({ color: 0x141517, metalness: 0.75, roughness: 0.5 })));
    foot.position.set(SX, 3, SZ - 80); scene.add(foot);
  }

  // ------------------------------------------------------------------ the keyboard: low, graphite, black keys
  {
    const KX = -60, KZ = -60, KW = 286, KD = 116;
    const base = shadowed(new THREE.Mesh(new ctx.RoundedBoxGeometry(KW, 7, KD, 3, 3), new THREE.MeshPhysicalMaterial({ color: 0x26272a, metalness: 0.85, roughness: 0.42 })));
    base.position.set(KX, 3.5, KZ); scene.add(base);
    const rows = [
      { h: 9, keys: Array(14).fill(1 / 14 * 14.5) },
      { h: 16.5, keys: [...Array(13).fill(1), 1.5] },
      { h: 16.5, keys: [1.5, ...Array(13).fill(1)] },
      { h: 16.5, keys: [1.75, ...Array(11).fill(1), 1.75] },
      { h: 16.5, keys: [2.25, ...Array(10).fill(1), 2.25] },
      { h: 16.5, keys: [1, 1, 1.25, 1.5, 4.5, 1.5, 1.25, 1, 1, 0.5] },
    ];
    const U = (KW - 16) / 14.5, GAP = 2.1;
    const geos = [];
    let z = KZ - KD / 2 + 7;
    for (const row of rows) {
      let x = KX - KW / 2 + 8;
      for (const w of row.keys) {
        const kw = w * U - GAP;
        if (w >= 0.75) {
          const kg = new ctx.RoundedBoxGeometry(kw, 2.4, row.h, 2, 1.1);
          kg.translate(x + kw / 2 + GAP / 2, 7 + 1.0, z + row.h / 2);
          geos.push(kg);
        }
        x += w * U;
      }
      z += row.h + GAP;
    }
    const keys = shadowed(new THREE.Mesh(ctx.BufferGeometryUtils.mergeGeometries(geos), new THREE.MeshPhysicalMaterial({ color: 0x0f0f11, roughness: 0.55, specularIntensity: 0.5 })));
    scene.add(keys);
  }

  // ------------------------------------------------------------------ a leather notebook and a pen at the left
  {
    const nb = shadowed(new THREE.Mesh(new ctx.RoundedBoxGeometry(150, 13, 212, 3, 3), new THREE.MeshPhysicalMaterial({ color: 0x1f1d1b, roughness: 0.72, sheen: 0.5, sheenRoughness: 0.6, sheenColor: new THREE.Color(0x6a625a) })));
    nb.position.set(-470, 6.5, -50); nb.rotation.y = 0.22; scene.add(nb);
    const pen = new THREE.Group();
    const barrel = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 138, 32), new THREE.MeshPhysicalMaterial({ color: 0x0b0b0c, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08 })));
    barrel.rotation.z = Math.PI / 2; pen.add(barrel);
    const tip = shadowed(new THREE.Mesh(new THREE.ConeGeometry(4.6, 12, 32), new THREE.MeshPhysicalMaterial({ color: 0x8d8a85, metalness: 1, roughness: 0.3 })));
    tip.rotation.z = -Math.PI / 2; tip.position.x = 75; pen.add(tip);
    pen.position.set(-372, 4.6, 40); pen.rotation.y = 1.2; scene.add(pen);
  }

  // ------------------------------------------------------------------ the device, beside the keyboard, slit off
  device.object.position.set(240, 0, -40);
  device.object.rotation.y = -0.32;
  device.anim.setSlit(0);
  device.anim.setTouch(0);
  for (const k of ['zirPolish', 'zirHoned', 'zirDish']) device.anim.materials[k].envMapIntensity = 0.35;
  {
    const S = 128, data = new Uint8Array(S * S * 4);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const u = (i + 0.5) / S * 2 - 1, v = (j + 0.5) / S * 2 - 1;
      const dx = Math.max(0, Math.abs(u) - 0.62) / 0.38, dy = Math.max(0, Math.abs(v) - 0.42) / 0.58;
      const k = Math.exp(-(dx * dx + dy * dy) * 4.5) * (1 - Math.max(Math.abs(u), Math.abs(v)) ** 8);
      const o = 4 * (j * S + i); data[o] = data[o + 1] = data[o + 2] = 0; data[o + 3] = Math.round(255 * 0.6 * k);
    }
    const tex = new THREE.DataTexture(data, S, S); tex.needsUpdate = true; tex.magFilter = tex.minFilter = THREE.LinearFilter;
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(128, 64), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2; blob.position.y = 0.15; blob.renderOrder = 1;
    device.object.add(blob);
  }

  // ------------------------------------------------------------------ camera: one slow push from the wide desk to the brief
  camera.fov = 24; camera.near = 10; camera.far = 30000; camera.updateProjectionMatrix();
  const sine = (x) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(x));
  const cam = [{ t: 0, v: [400, 540, 2200] }, { t: duration, v: [240, 455, 1420] }];
  const look = [{ t: 0, v: [10, 230, -250] }, { t: duration, v: [20, 200, -250] }];

  return {
    update(t) {
      camera.position.set(...track(cam, t, sine)); camera.lookAt(...track(look, t, sine));
      device.anim.setSlit(0);
    },
  };
}
