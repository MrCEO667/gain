// Animated shots. Query: ?shot=/shots/reveal.js&w=1920&h=1080&pr=1.5
// A shot module exports { duration, fps?, device?, setup({ THREE, stage, device, ctx }) → { update(t) } }.
// `device` holds overrides for makeBuild(); the shot then drives camera, lights and device.anim per frame.
import { THREE, createStage, modelContext, castShadows } from './lib/studio-core.js';
import { makeBuild } from './device/gain-device.js';

const params = new URLSearchParams(location.search);
const W = +params.get('w') || 1920, H = +params.get('h') || 1080, PR = +params.get('pr') || 1.5;

async function main() {
  const canvas = document.querySelector('canvas');
  Object.assign(canvas.style, { width: `${W}px`, height: `${H}px` });
  const stage = createStage(canvas, { width: W, height: H, pixelRatio: PR });
  const shot = await import(params.get('shot'));
  const ctx = modelContext();
  const device = await makeBuild(shot.device || {})(ctx);
  castShadows(device.object);
  stage.scene.add(device.object);
  const api = await shot.setup({ THREE, stage, device, ctx });
  window.__shot = { duration: shot.duration, fps: shot.fps || 30 };
  window.__frame = (t) => { api.update(t); stage.composer.render(); return true; };
  window.__ready = true;
}

main().catch((e) => { window.__error = String((e && e.stack) || e); });
