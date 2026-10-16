// Render a model to PNG stills.
// Usage: node render.mjs <modelDir> [view ...]   (default views: hero top profile detail scale)
// Writes <modelDir>/renders/<view>.png and prints the model's bounding dimensions and approximate volume.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, serve, launch, webPath } from './lib/headless.mjs';

const modelDir = path.resolve(process.argv[2] || '');
const views = process.argv.slice(3).length ? process.argv.slice(3) : ['hero', 'top', 'profile', 'detail', 'scale'];
if (!fs.existsSync(path.join(modelDir, 'model.js'))) { console.error(`no model.js in ${modelDir}`); process.exit(2); }
if (!modelDir.startsWith(ROOT)) { console.error(`model dir must be inside ${ROOT}`); process.exit(2); }

const { server, origin } = await serve();
const browser = await launch();
const outDir = path.join(modelDir, 'renders');
fs.mkdirSync(outDir, { recursive: true });
const rel = webPath(path.join(modelDir, 'model.js'));
let failed = false;
for (const view of views) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.text()); });
  page.on('pageerror', (e) => logs.push(String(e)));
  await page.goto(`${origin}/studio.html?model=${encodeURIComponent(rel + '?t=' + Date.now())}&view=${view}`);
  try {
    await page.waitForFunction(() => window.__done || window.__error, null, { timeout: 180000 });
  } catch { logs.push('timeout waiting for render'); }
  const err = await page.evaluate(() => window.__error);
  if (err || !(await page.evaluate(() => window.__done))) {
    console.error(`[${view}] FAILED: ${err || ''}\n${logs.join('\n')}`); failed = true; await page.close(); continue;
  }
  const file = path.join(outDir, `${view}.png`);
  await page.locator('canvas').screenshot({ path: file });
  const meta = await page.evaluate(() => window.__meta);
  console.log(`[${view}] ${file}  dims(mm)=${JSON.stringify(meta.dims)} bbox(x,y,z mm)=${JSON.stringify(meta.bbox)} volume≈${meta.volume_cm3} cm3${logs.length ? '\n  console: ' + logs.join('\n  ') : ''}`);
  await page.close();
}
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
