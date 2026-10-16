// Still renders of a model in the studio. Query: ?model=/device/model.js&view=hero
// A model module default-exports build(ctx) → { object, dims?, focus?, views? }.
import { THREE, createStage, modelContext, castShadows, frame, creditCard, airpodsCase } from './lib/studio-core.js';

const W = 1600, H = 1000;
const params = new URLSearchParams(location.search);
const modelPath = params.get('model');
const viewName = params.get('view') || 'hero';

async function main() {
  const { scene, camera, composer } = createStage(document.querySelector('canvas'), { width: W, height: H });
  const mod = await import(modelPath);
  const built = await mod.default(modelContext());
  const object = built.object;
  castShadows(object);
  scene.add(object);
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  const custom = (built.views || []).find((v) => v.name === viewName);
  const focus = new THREE.Vector3(...(built.focus || [center.x, box.max.y, center.z]));

  if (custom) {
    camera.fov = custom.fov || 30; camera.updateProjectionMatrix();
    camera.position.set(...custom.cam); camera.lookAt(new THREE.Vector3(...custom.target));
  } else if (viewName === 'hero') {
    frame(camera, box, [-0.9, 0.55, 1.25], 0.6);
  } else if (viewName === 'top') {
    camera.up.set(0, 0, -1);
    frame(camera, box, [0, 1, 0.12], 0.62);
  } else if (viewName === 'profile') {
    frame(camera, box, [0, 0.1, 1], 0.6);
  } else if (viewName === 'detail') {
    camera.fov = 22; camera.updateProjectionMatrix();
    const size = box.getSize(new THREE.Vector3()).length();
    camera.position.copy(focus).add(new THREE.Vector3(-0.35, 0.8, 0.55).normalize().multiplyScalar(size * 1.05));
    camera.lookAt(focus);
  } else if (viewName === 'scale') {
    object.position.x -= center.x; object.position.z -= center.z;
    const w = box.max.x - box.min.x;
    const card = creditCard(); card.position.set(-(w / 2) - 60, 0, 0); scene.add(card);
    const pods = airpodsCase(); pods.position.set(w / 2 + 48, 0, 0); scene.add(pods);
    castShadows(card); castShadows(pods);
    object.updateMatrixWorld(true);
    const all = new THREE.Box3().setFromObject(object).union(new THREE.Box3().setFromObject(card)).union(new THREE.Box3().setFromObject(pods));
    frame(camera, all, [0, 1.1, 0.9], 0.8);
  }

  composer.render();

  // Rough enclosed volume: sum of |signed volume| per mesh (overlapping parts are double-counted).
  let vol = 0;
  object.traverse((o) => {
    if (!o.isMesh || o.userData.noVolume) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
    const pos = g.attributes.position; const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    let v = 0;
    for (let i = 0; i < pos.count; i += 3) {
      a.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); b.fromBufferAttribute(pos, i + 1).applyMatrix4(o.matrixWorld); c.fromBufferAttribute(pos, i + 2).applyMatrix4(o.matrixWorld);
      v += a.dot(b.clone().cross(c)) / 6;
    }
    vol += Math.abs(v);
  });
  const size = box.getSize(new THREE.Vector3()).toArray().map((v) => +v.toFixed(1));
  window.__meta = { dims: built.dims || size, bbox: size, volume_cm3: +(vol / 1000).toFixed(1) };
  window.__done = true;
}

main().catch((e) => { window.__error = String((e && e.stack) || e); });
