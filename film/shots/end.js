// Shot 7: end. Black. The device at the hero angle in a single pool of light, slit breathing. The light rises over the
// first second and the camera barely drifts. The lower third stays dark for the "Coming soon" title added in the edit.
import { ramp, track } from '../lib/anim.js';

export const duration = 3.5;

export function setup({ THREE, stage, device }) {
  const { scene, camera, lights } = stage;
  scene.background = new THREE.Color(0x000000);
  scene.fog = null;
  for (const l of Object.values(lights)) l.intensity = 0;
  const envFull = 0.55;

  // one overhead spot: a soft pool on the floor and crisp highlights along the chamfers
  const spot = new THREE.SpotLight(0xfff4e6, 0, 0, THREE.MathUtils.degToRad(17), 0.9, 0);
  spot.position.set(0, 320, 30);
  spot.target.position.set(0, 0, 0);
  spot.castShadow = true;
  spot.shadow.mapSize.set(2048, 2048); spot.shadow.radius = 8; spot.shadow.bias = -0.0004;
  scene.add(spot, spot.target);
  stage.floor.material.color.set(0x0a0a0b);

  camera.fov = 22; camera.updateProjectionMatrix();
  const cam = [{ t: 0, v: [-104, 58, 262] }, { t: duration, v: [-88, 60, 254] }];
  // looking below the device puts it in the upper middle and leaves the lower third dark
  const look = [{ t: 0, v: [0, -22, 0] }, { t: duration, v: [2, -22, 0] }];

  return {
    update(t) {
      camera.position.set(...track(cam, t)); camera.lookAt(...track(look, t));
      const k = ramp(t, 0, 1.1);
      spot.intensity = 1.7 * k;
      scene.environmentIntensity = envFull * k;
      device.anim.setSlit(ramp(t, 0.5, 1.3) * (0.82 + 0.18 * Math.cos(Math.max(0, t - 1.3) * 2.2)));
    },
  };
}
