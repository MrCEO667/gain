// Shared studio for Gain renders: materials, a dark softbox environment, floor, lights and post-processing.
// Units: 1 = 1 mm. The floor is y = 0. Used by studio.js (stills) and motion.js (animated shots).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { ParametricGeometry } from 'three/addons/geometries/ParametricGeometry.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export { THREE };
export const BRAND_BLUE = 0x7cc4ff;

export function materials() {
  return {
    anodizedBlack: new THREE.MeshPhysicalMaterial({ color: 0x2b2c30, metalness: 0.55, roughness: 0.4 }),
    anodizedGraphite: new THREE.MeshPhysicalMaterial({ color: 0x3a3c40, metalness: 0.9, roughness: 0.38 }),
    ceramicBlackPolished: new THREE.MeshPhysicalMaterial({ color: 0x0c0c0e, metalness: 0, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.06 }),
    ceramicBlackMatte: new THREE.MeshPhysicalMaterial({ color: 0x111113, metalness: 0, roughness: 0.55, clearcoat: 0.2, clearcoatRoughness: 0.5 }),
    titanium: new THREE.MeshPhysicalMaterial({ color: 0x8d8a85, metalness: 1, roughness: 0.32 }),
    titaniumDark: new THREE.MeshPhysicalMaterial({ color: 0x45433f, metalness: 1, roughness: 0.35 }),
    sapphire: new THREE.MeshPhysicalMaterial({ color: 0x08080a, metalness: 0, roughness: 0.03, clearcoat: 1, clearcoatRoughness: 0.02, ior: 1.77 }),
    leather: new THREE.MeshPhysicalMaterial({ color: 0x2b211b, metalness: 0, roughness: 0.78, sheen: 0.4, sheenRoughness: 0.6 }),
    ledBlue: new THREE.MeshBasicMaterial({ color: new THREE.Color(BRAND_BLUE).multiplyScalar(5) }),
    ledWhite: new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(4) }),
    port: new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.9 }),
  };
}

// Dark studio environment: softboxes on black, so dark metal and ceramic get long clean highlights.
export function studioEnvironment(renderer) {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x000000);
  const panel = (w, h, intensity, pos, look) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(intensity), side: THREE.DoubleSide }));
    mesh.position.set(...pos); mesh.lookAt(...look); env.add(mesh);
  };
  panel(7, 5, 1.6, [0, 9, 1], [0, 0, 0]);         // overhead softbox
  panel(1.2, 9, 4.0, [-8, 2.5, 3], [0, 0, 0]);     // left strip: long edge highlights
  panel(1.2, 9, 2.4, [8, 2.5, -1], [0, 0, 0]);     // right strip
  panel(12, 1.6, 1.1, [0, 1.2, 9], [0, 1, 0]);     // low front panel: sheen on faces toward camera
  panel(12, 1.6, 0.7, [0, 1.2, -9], [0, 1, 0]);    // low back panel: rim on far edges
  panel(1.6, 1.6, 1.5, [-5, 6, 6], [0, 0, 0]);     // small kicker for crisp chamfer glints
  panel(10, 4, 0.9, [0, 6, -8], [0, 0, 0]);        // upper back softbox: sheen on top faces seen from above
  panel(14, 3, 1.0, [0, -1.6, 8], [0, 0, 0]);      // below-horizon bounce, so vertical faces toward camera aren't pitch black
  panel(3, 14, 0.7, [-8, -1.2, 0], [0, 0, 0]);
  panel(3, 14, 0.5, [8, -1.2, 0], [0, 0, 0]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.02).texture;
  pmrem.dispose();
  return tex;
}

export function backgroundTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 640;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(512, 260, 40, 512, 300, 720);
  grd.addColorStop(0, '#1b1c1f'); grd.addColorStop(0.55, '#0c0c0e'); grd.addColorStop(1, '#040405');
  g.fillStyle = grd; g.fillRect(0, 0, 1024, 640);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// Scale references (real dimensions): credit card 85.6 × 54 × 0.8, AirPods Pro 2 case 60.6 × 45.2 × 21.7.
export function creditCard() {
  const g = new THREE.Group();
  const card = new THREE.Mesh(new RoundedBoxGeometry(85.6, 0.8, 54, 2, 0.4), new THREE.MeshPhysicalMaterial({ color: 0x34363b, roughness: 0.32, metalness: 0.4 }));
  card.position.y = 0.4; g.add(card);
  const chip = new THREE.Mesh(new RoundedBoxGeometry(11, 0.2, 9, 2, 0.1), new THREE.MeshPhysicalMaterial({ color: 0xb59a5a, metalness: 1, roughness: 0.3 }));
  chip.position.set(-28, 0.85, -6); g.add(chip);
  return g;
}
export function airpodsCase() {
  const g = new THREE.Group();
  const white = new THREE.MeshPhysicalMaterial({ color: 0xf2f2f0, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2 });
  const body = new THREE.Mesh(new RoundedBoxGeometry(60.6, 21.7, 45.2, 8, 9.5), white);
  body.position.y = 21.7 / 2; g.add(body);
  return g;
}

// Place the camera along `dir` from the box centre so the projected box fills `fill` of the frame.
export function frame(camera, box, dir, fill = 0.62) {
  const center = box.getCenter(new THREE.Vector3());
  const d = new THREE.Vector3(...dir).normalize();
  let dist = box.getSize(new THREE.Vector3()).length() * 2;
  const corners = [];
  for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
  for (let i = 0; i < 6; i++) {
    camera.position.copy(center).addScaledVector(d, dist); camera.lookAt(center); camera.updateMatrixWorld(true);
    let ext = 0;
    for (const c of corners) { const p = c.clone().project(camera); ext = Math.max(ext, Math.abs(p.x), Math.abs(p.y)); }
    dist *= ext / fill;
  }
  camera.position.copy(center).addScaledVector(d, dist); camera.lookAt(center);
}

// Renderer + scene with the studio floor and lights. Returns handles so animated shots can dim or move them.
export function createStage(canvas, { width, height, pixelRatio = 2 }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(width, height, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = backgroundTexture();
  scene.environment = studioEnvironment(renderer);
  scene.environmentIntensity = 0.9;
  scene.fog = new THREE.Fog(0x050506, 500, 1400);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshPhysicalMaterial({ color: 0x060607, roughness: 0.72, metalness: 0, envMapIntensity: 0.2 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(-120, 260, 160); key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096); key.shadow.radius = 6; key.shadow.bias = -0.0004; key.shadow.normalBias = 0.3;
  Object.assign(key.shadow.camera, { left: -200, right: 200, top: 200, bottom: -200, near: 1, far: 1000 });
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 0.55); fill.position.set(-100, 45, 220); scene.add(fill);
  const rim = new THREE.DirectionalLight(0xdfe8ff, 1.1); rim.position.set(200, 120, -220); scene.add(rim);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 0.08); scene.add(hemi);

  const camera = new THREE.PerspectiveCamera(30, width / height, 1, 5000);
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(pixelRatio); composer.setSize(width, height);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.6, 0.35, 2.6);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  return { renderer, scene, camera, composer, bloom, floor, lights: { key, fill, rim, hemi } };
}

export function modelContext() {
  return { THREE, RoundedBoxGeometry, ConvexGeometry, ParametricGeometry, BufferGeometryUtils, mats: materials(), BRAND_BLUE };
}

export function castShadows(object) {
  object.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
}
