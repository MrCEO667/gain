// Shot: the reveal. Black. A sweep of light runs along the diamond-cut chamfer and draws the device out of the dark,
// the studio light comes up as the camera rises to the hero angle, then the white slit fades on: Gain is listening.
import { ramp, track, easeInOut, lerp } from '../lib/anim.js';

export const duration = 6;

export function setup({ THREE, stage, device }) {
  const { scene, camera, lights } = stage;
  const base = { env: scene.environmentIntensity, key: lights.key.intensity, fill: lights.fill.intensity, rim: lights.rim.intensity, hemi: lights.hemi.intensity };
  const floorColor = stage.floor.material.color.clone();

  // The sweep: a small hard light travelling left to right high above the front edge, placed so its reflection
  // in the front top chamfer faces the camera: a glint runs along the cut edge.
  const sweep = new THREE.PointLight(0xffffff, 0, 0, 0);
  scene.add(sweep);

  camera.fov = 24; camera.updateProjectionMatrix();
  // one slow, continuous orbit with a slight push in; the whole device stays in frame
  const cam = [
    { t: 0, v: [-118, 26, 150] },
    { t: duration, v: [-74, 36, 172] },
  ];
  const look = [
    { t: 0, v: [0, 5, 0] },
    { t: duration, v: [3, 6, 0] },
  ];

  return {
    update(t) {
      const p = track(cam, t), q = track(look, t);
      camera.position.set(...p); camera.lookAt(...q);

      // sweep runs 0.3–2.6 s along x, fading in and out at the ends
      const s = ramp(t, 0.3, 2.6, easeInOut);
      sweep.position.set(lerp(-140, 140, s), 120, 60);
      sweep.intensity = 2.2 * Math.sin(Math.PI * Math.min(1, Math.max(0, (t - 0.3) / 2.3)));

      // studio light comes up 2.0–4.2 s
      const k = ramp(t, 2.0, 4.2);
      scene.environmentIntensity = base.env * k;
      scene.backgroundIntensity = k;
      lights.key.intensity = base.key * k; lights.fill.intensity = base.fill * k;
      lights.rim.intensity = base.rim * k; lights.hemi.intensity = base.hemi * k;
      // no floor spill from the sweep while it's dark: scale the floor's colour and its reflections
      stage.floor.material.color.copy(floorColor).multiplyScalar(k);
      stage.floor.material.specularIntensity = k;

      // the slit fades on 4.2–5.0 s with one slow breath
      device.anim.setSlit(ramp(t, 4.2, 5.0) * (0.85 + 0.15 * Math.cos(Math.max(0, t - 5.0) * 2.4)));
    },
  };
}
