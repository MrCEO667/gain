// Shot 5 · cabin: forty-one thousand feet. A private-jet cabin at altitude: an ivory sidewall with one large oval
// window set in a deep, rounded reveal. Outside, a sunlit sea of cloud tops under a pale sky drifts past. Warm sun
// through the window lays an oval of light across a polished walnut side table where the device lies, its slit
// breathing softly. One slow lateral dolly along the table toward the window. Quiet, expensive, unhurried.
import { Reflector } from 'three/addons/objects/Reflector.js';
import { track, easeInOut, clamp } from '../lib/anim.js';

export const duration = 5.5;

// cabin layout (mm). The device rests at the origin; the table top is y = 0; the sidewall faces +z.
const WZ = -240;                 // sidewall plane
const WX = 230, WY = 195;        // window centre on the wall
const OA = 195, OB = 138;        // outer edge of the reveal (half-axes)
const IA = 154, IB = 104;        // inner opening at the pane (half-axes)
const DEPTH = 64;                // reveal depth
const TZ1 = 190;                 // table front edge

export function setup({ THREE, stage, device, ctx }) {
  const { scene, camera, lights, renderer } = stage;
  scene.fog = null;
  scene.background = new THREE.Color(0x000000);
  stage.floor.visible = false;

  // ------------------------------------------------------------------ procedural textures
  // small 2D value noise for canvas textures
  const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
  const vnoise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const fbm = (x, y, o = 4) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * vnoise(x * f, y * f); a *= 0.5; f *= 2.03; } return s; };

  // polished walnut: long straight grain along x, a slow cathedral figure, fine dark pores
  const TL = 3000, TD = TZ1 - WZ;
  function walnutTexture() {
    const W = 3072, H = 768, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), img = g.createImageData(W, H), px = img.data;
    const dark = [52, 36, 26], mid = [96, 68, 48], light = [138, 102, 74];
    for (let j = 0; j < H; j++) {
      const v = j / H * TD;
      for (let i = 0; i < W; i++) {
        const u = i / W * TL;
        const warp = (fbm(u * 0.0016, v * 0.012, 3) - 0.5) * 70 + Math.sin(u * 0.0031 + v * 0.011) * 9;
        const w = v + warp;
        const band = 0.5 + 0.5 * Math.sin(w * 0.42 + fbm(u * 0.004, v * 0.05, 2) * 6);
        const figure = fbm(u * 0.0011 + 7, w * 0.03, 3);
        const pores = vnoise(u * 0.09, w * 1.6) * vnoise(u * 0.035 + 3, w * 0.9);
        let k = 0.18 + 0.5 * figure + 0.28 * Math.pow(band, 3) - 0.22 * Math.pow(pores, 2);
        k = clamp(k);
        const col = k < 0.5 ? dark.map((d, n) => d + (mid[n] - d) * (k / 0.5)) : mid.map((m, n) => m + (light[n] - m) * ((k - 0.5) / 0.5));
        const o = 4 * (j * W + i);
        px[o] = col[0]; px[o + 1] = col[1]; px[o + 2] = col[2]; px[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }
  // ivory leather-and-composite: very low-frequency mottling plus fine grain so the soft gradients never band
  function ivoryTexture() {
    const S = 1024, c = document.createElement('canvas'); c.width = S; c.height = S;
    const g = c.getContext('2d'), img = g.createImageData(S, S), px = img.data;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const k = 0.94 + 0.05 * fbm(i * 0.006, j * 0.006, 3) + 0.025 * (hash(i, j) - 0.5);
      const o = 4 * (j * S + i);
      px[o] = 232 * k; px[o + 1] = 224 * k; px[o + 2] = 210 * k; px[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  // ------------------------------------------------------------------ environment: the cabin itself, for reflections
  {
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.BoxGeometry(20, 20, 20), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xe8dccb).multiplyScalar(0.11), side: THREE.BackSide })));
    const add = (geo, color, k, pos) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), side: THREE.DoubleSide })); m.position.set(...pos); m.lookAt(0, 0, 0); env.add(m); return m; };
    const wd = new THREE.Vector3(WX, WY, WZ).normalize().multiplyScalar(8);
    const win = add(new THREE.CircleGeometry(1, 64), 0xf3f1ec, 1.2, wd.toArray()); win.scale.set(2.6, 1.8, 1);
    add(new THREE.PlaneGeometry(18, 18), 0x050403, 1, [0, -9.5, 0]);      // dark carpet far below
    add(new THREE.PlaneGeometry(14, 3), 0xfff0dc, 0.3, [0, 9, 3]);       // indirect cove light along the ceiling
    add(new THREE.PlaneGeometry(6, 6), 0xffe6c8, 0.22, [-3, -2, 8]);       // warm bounce from the sunlit table and seat
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(env, 0.03).texture;
    pmrem.dispose();
    scene.environmentIntensity = 0.75;
  }

  // ------------------------------------------------------------------ lights: the stage key becomes the sun
  const sunDir = new THREE.Vector3(0.5, 0.52, -0.6).normalize();       // toward the sun: beyond the window, high, a little forward
  const sun = lights.key;
  sun.color.set(0xffe8cc);
  sun.intensity = 11;
  sun.target.position.set(60, 0, -40); scene.add(sun.target);
  sun.position.copy(sun.target.position).addScaledVector(sunDir, 1000);
  Object.assign(sun.shadow.camera, { left: -820, right: 820, top: 820, bottom: -820, near: 200, far: 2400 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 1.2;
  lights.fill.intensity = 0;
  // the cabin's own soft wash: a wide, warm spot from up the aisle that falls off across the sidewall
  const wash = new THREE.SpotLight(0xfff0e0, 1.25, 0, 0.42, 1.0, 0);
  wash.position.set(-300, 700, 700); wash.target.position.set(170, 170, -240);
  scene.add(wash, wash.target);
  lights.rim.intensity = 0;
  lights.hemi.color.set(0xfff2e4); lights.hemi.groundColor.set(0x1a1612); lights.hemi.intensity = 0.12;

  const shadowed = (m, cast = true) => { m.castShadow = cast; m.receiveShadow = true; return m; };

  // ------------------------------------------------------------------ sidewall with the oval cut-out
  const ivory = ivoryTexture();
  const wallMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: ivory, roughness: 0.75, sheen: 0.3, sheenRoughness: 0.55, sheenColor: new THREE.Color(0xfff3e4), shadowSide: THREE.DoubleSide });
  const N = 192;   // points around the oval (ShapeGeometry: 2 × curveSegments for an ellipse)
  {
    const s = new THREE.Shape();
    s.moveTo(-2000, -80); s.lineTo(2400, -80); s.lineTo(2400, 1400); s.lineTo(-2000, 1400); s.closePath();
    const hole = new THREE.Path(); hole.absellipse(WX, WY, OA, OB, 0, Math.PI * 2, true); s.holes.push(hole);
    const g = new THREE.ShapeGeometry(s, N / 2);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 900, p.getY(i) / 900);
    const wall = shadowed(new THREE.Mesh(g, wallMat));
    wall.position.z = WZ; wall.name = 'wall'; scene.add(wall);
  }

  // the reveal: a loft from the outer oval on the wall to the inner opening, with a rounded lip
  const revealMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: ivory, roughness: 0.85, side: THREE.DoubleSide, shadowSide: THREE.DoubleSide });
  {
    const M = 24, pos = [], uvs = [], idx = [];
    for (let j = 0; j <= M; j++) {
      const u = (j / M) ** 2;                       // dense near the lip
      const gk = Math.sqrt(u);                      // radius eases in fast at the wall: a soft rounded lip
      const a = OA + (IA - OA) * gk, b = OB + (IB - OB) * gk, z = WZ - DEPTH * u;
      for (let i = 0; i < N; i++) {
        const th = (i / N) * Math.PI * 2;
        pos.push(WX + a * Math.cos(th), WY + b * Math.sin(th), z);
        uvs.push(pos[pos.length - 3] / 900, pos[pos.length - 2] / 900);
      }
    }
    for (let j = 0; j < M; j++) for (let i = 0; i < N; i++) {
      const a = j * N + i, b = j * N + (i + 1) % N, c = (j + 1) * N + i, d = (j + 1) * N + (i + 1) % N;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx); g.computeVertexNormals();
    // it casts but does not receive the sun's shadow: the sun simply warms its lower, window-facing side
    const reveal = new THREE.Mesh(g, revealMat); reveal.castShadow = true; reveal.name = 'reveal'; scene.add(reveal);
  }
  // a soft grey seal around the pane, and the pane itself (barely there)
  {
    const s = new THREE.Shape(); s.absellipse(WX, WY, IA + 2, IB + 2, 0, Math.PI * 2, false);
    const h = new THREE.Path(); h.absellipse(WX, WY, IA - 7, IB - 7, 0, Math.PI * 2, true); s.holes.push(h);
    const seal = shadowed(new THREE.Mesh(new THREE.ShapeGeometry(s, 96), new THREE.MeshPhysicalMaterial({ color: 0x8c877f, roughness: 0.7, shadowSide: THREE.DoubleSide })));
    seal.position.z = WZ - DEPTH + 0.6; seal.name = 'seal'; scene.add(seal);
    const ps = new THREE.Shape(); ps.absellipse(WX, WY, IA - 6, IB - 6, 0, Math.PI * 2, false);
    const pane = new THREE.Mesh(new THREE.ShapeGeometry(ps, 96), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.05, roughness: 0.08, depthWrite: false }));
    pane.position.z = WZ - DEPTH - 4; pane.name = 'pane'; scene.add(pane);
    // the shade, drawn a little way down: pleated cream fabric, glowing faintly with the sun behind it
    const ys = WY + IB * 0.72, a = IA - 6, b = IB - 6, th = Math.asin((ys - WY) / b);
    const ss = new THREE.Shape(); ss.absellipse(WX, WY, a, b, th, Math.PI - th, false); ss.closePath();
    const c = document.createElement('canvas'); c.width = 8; c.height = 256; const g = c.getContext('2d');
    for (let j = 0; j < 256; j++) { const k = 0.86 + 0.14 * Math.pow(0.5 + 0.5 * Math.cos(j / 256 * Math.PI * 2 * 9), 2); g.fillStyle = `rgb(${236 * k},${228 * k},${214 * k})`; g.fillRect(0, j, 8, 1); }
    const pleat = new THREE.CanvasTexture(c); pleat.colorSpace = THREE.SRGBColorSpace;
    const sg = new THREE.ShapeGeometry(ss, 64), sp = sg.attributes.position, su = sg.attributes.uv;
    for (let i = 0; i < sp.count; i++) su.setXY(i, 0.5, (sp.getY(i) - ys) / (WY + b - ys));
    const shade = shadowed(new THREE.Mesh(sg, new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: pleat, emissive: 0xffeedd, emissiveMap: pleat, emissiveIntensity: 0.22, roughness: 0.9, shadowSide: THREE.DoubleSide })));
    shade.position.z = WZ - DEPTH + 4; shade.name = 'shade'; scene.add(shade);
    const bar = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 2 * Math.sqrt(1 - ((ys - WY) / b) ** 2) * a, 16), new THREE.MeshPhysicalMaterial({ color: 0xd8d0c2, roughness: 0.45 })));
    bar.rotation.z = Math.PI / 2; bar.position.set(WX, ys, WZ - DEPTH + 7); scene.add(bar);
  }

  // ------------------------------------------------------------------ the sky: a sea of cloud tops at infinity, drifting past
  const sky = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uSun: { value: sunDir.clone() } },
    vertexShader: /* glsl */`
      varying vec3 vWorld;
      void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform vec3 uSun;
      varying vec3 vWorld;
      float hash(vec2 p) { p = fract(p * vec2(234.34, 435.345)); p += dot(p, p + 34.23); return fract(p.x * p.y); }
      float noise(vec2 p) {
        vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
      }
      // fbm that fades out octaves finer than a pixel (fw: footprint of p per pixel), so the far deck never shimmers
      float fbm(vec2 p, float fw) {
        float s = 0.0, a = 0.5;
        mat2 r = mat2(1.6, 1.2, -1.2, 1.6);
        for (int i = 0; i < 6; i++) {
          float k = 1.0 - smoothstep(0.2, 0.5, fw);
          s += a * mix(0.5, abs(2.0 * noise(p) - 1.0), k);   // billows: rounded tops, creased valleys
          p = r * p; fw *= 2.0; a *= 0.5;
        }
        return s;
      }
      float puffs(float h) { return smoothstep(0.12, 0.62, h); }
      void main() {
        vec3 d = normalize(vWorld - cameraPosition);
        float e = d.y - 0.055;                              // the horizon (cheated up a few degrees, so the window shows the deck)
        vec3 haze = vec3(0.92, 0.91, 0.89);
        vec3 sunC = vec3(1.0, 0.95, 0.88);
        vec2 sh = normalize(uSun.xz);
        float toward = max(dot(normalize(d.xz), sh), 0.0); // how much we look toward the sun's side
        // pale sky: warm haze at the horizon to a soft blue a few degrees up, brighter toward the sun
        vec3 sky = mix(haze * 0.88, vec3(0.42, 0.56, 0.80) * 0.78, smoothstep(0.0, 0.03, e));
        sky += sunC * (pow(max(dot(d, uSun), 0.0), 5.0) * 0.22);
        // the cloud deck: a height field on a plane below; parallax is exact for a scene at infinity
        float de = max(-e, 0.003);
        vec2 p = d.xz / de * 0.9;
        p.x -= uTime * 0.08;
        float fw = length(fwidth(p));
        const float E = 0.03;
        float h = puffs(fbm(p, fw));
        float hx = puffs(fbm(p + vec2(E, 0.0), fw)), hz = puffs(fbm(p + vec2(0.0, E), fw));
        vec3 n = normalize(vec3(-(hx - h) / E * 0.5, 1.0, -(hz - h) / E * 0.5));
        float lam = clamp(dot(n, uSun), 0.0, 1.0);
        vec3 valley = vec3(0.40, 0.47, 0.58);
        vec3 top = sunC * (0.66 + 0.62 * lam);
        vec3 cloud = mix(valley, top, smoothstep(0.0, 0.7, h));
        cloud += sunC * (h * (1.0 - h) * 1.1 * toward);       // thin edges glow, backlit
        float haze2 = exp(-de * 24.0);                       // aerial perspective toward the horizon
        vec3 deck = mix(cloud, haze * 0.98, haze2);
        vec3 col = mix(sky, deck, smoothstep(0.002, -0.006, e));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(3600, 64, 32), sky);
  dome.renderOrder = 10;                                    // drawn after the wall, so the hidden part costs little
  scene.add(dome);

  // ------------------------------------------------------------------ the walnut side table, against the wall
  {
    const g = new ctx.RoundedBoxGeometry(TL, 30, TD, 4, 10);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / TL + 0.5, 1 - (p.getZ(i) / TD + 0.5));
    const walnut = new THREE.MeshPhysicalMaterial({ map: walnutTexture(), roughness: 0.55, specularIntensity: 0.35, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 0.8 });
    const top = shadowed(new THREE.Mesh(g, walnut), false);
    // the back edge stands 3 mm off the wall, so the sun's shadow bias never leaks light along the joint
    top.position.set(200, -15, (WZ + TZ1) / 2 + 3); scene.add(top);
    // the polish: a faint mirror of the window and the device in the lacquer (half resolution keeps it soft)
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const mirror = new Reflector(new THREE.PlaneGeometry(TL - 40, TD - 24), {
      textureWidth: Math.round(size.x / 2), textureHeight: Math.round(size.y / 2), multisample: 0, color: new THREE.Color(1, 1, 1).multiplyScalar(0.04),
      shader: {
        name: 'LacquerReflection',
        uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null } },
        vertexShader: 'uniform mat4 textureMatrix; varying vec4 vUv; void main() { vUv = textureMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform vec3 color; uniform sampler2D tDiffuse; varying vec4 vUv; void main() { gl_FragColor = vec4(texture2DProj(tDiffuse, vUv).rgb * color, 1.0); }',
      },
    });
    Object.assign(mirror.material, { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    mirror.rotation.x = -Math.PI / 2; mirror.position.set(200, 0.05, (WZ + TZ1) / 2 - 6);
    scene.add(mirror);
    // the cabinet below, set back under the top
    const body = shadowed(new THREE.Mesh(new THREE.BoxGeometry(TL, 700, TD - 30), new THREE.MeshPhysicalMaterial({ color: 0x8a8278, map: ivory, roughness: 0.6 })), false);
    body.position.set(200, -380, (WZ + TZ1 - 30) / 2); scene.add(body);
  }

  // ------------------------------------------------------------------ the device, set down slightly askew
  device.object.position.set(-60, 0, 5);
  device.object.rotation.y = -0.2;
  for (const k of ['zirPolish', 'zirHoned', 'zirDish']) device.anim.materials[k].envMapIntensity = 0.7;
  // a soft contact shadow so it sits on the wood in the ambient light too
  {
    const S = 128, data = new Uint8Array(S * S * 4);
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const u = (i + 0.5) / S * 2 - 1, v = (j + 0.5) / S * 2 - 1;
      const dx = Math.max(0, Math.abs(u) - 0.62) / 0.38, dy = Math.max(0, Math.abs(v) - 0.42) / 0.58;
      const k = Math.exp(-(dx * dx + dy * dy) * 4.5) * (1 - Math.max(Math.abs(u), Math.abs(v)) ** 8);
      const o = 4 * (j * S + i); data[o] = data[o + 1] = data[o + 2] = 0; data[o + 3] = Math.round(255 * 0.55 * k);
    }
    const tex = new THREE.DataTexture(data, S, S); tex.needsUpdate = true; tex.magFilter = tex.minFilter = THREE.LinearFilter;
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(128, 64), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    blob.rotation.x = -Math.PI / 2; blob.position.y = 0.15; blob.renderOrder = 1;
    device.object.add(blob);
  }

  // ------------------------------------------------------------------ camera: one slow lateral dolly toward the window
  camera.fov = 32; camera.near = 5; camera.far = 6000; camera.updateProjectionMatrix();
  const cam = [{ t: 0, v: [-330, 172, 560] }, { t: duration, v: [-160, 182, 610] }];
  const look = [{ t: 0, v: [30, 110, -100] }, { t: duration, v: [120, 108, -110] }];

  return {
    update(t) {
      camera.position.set(...track(cam, t, easeInOut)); camera.lookAt(...track(look, t, easeInOut));
      sky.uniforms.uTime.value = t;
      // the slit breathes: a slow, soft swell (about 3.6 s per breath)
      device.anim.setSlit(0.62 + 0.3 * (0.5 - 0.5 * Math.cos((t + 0.6) * Math.PI * 2 / 3.6)));
    },
  };
}
