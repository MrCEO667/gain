// Render an animated shot to an MP4 (or a few test stills).
// Usage: node render-shot.mjs shots/reveal.js [--w 1920 --h 1080 --pr 1.5] [--out out/reveal.mp4] [--stills 0.5,2,4]
// Frames go to out/frames/<shot>/ and are encoded with ffmpeg (H.264, yuv420p). --stills writes PNGs at those times only.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, serve, launch, webPath } from './lib/headless.mjs';

const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : def; };
const shotFile = path.resolve(argv[0] || '');
if (!fs.existsSync(shotFile) || !shotFile.startsWith(ROOT)) { console.error(`shot not found inside ${ROOT}: ${argv[0]}`); process.exit(2); }
const W = +opt('w', 1920), H = +opt('h', 1080), PR = +opt('pr', 1.5);
const name = path.basename(shotFile, '.js');
const outFile = path.resolve(opt('out', path.join(ROOT, 'out', `${name}.mp4`)));
const stills = opt('stills', '');

const { server, origin } = await serve();
const browser = await launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const logs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.text()); });
page.on('pageerror', (e) => logs.push(String(e)));
await page.goto(`${origin}/motion.html?shot=${encodeURIComponent(webPath(shotFile) + '?t=' + Date.now())}&w=${W}&h=${H}&pr=${PR}`);
await page.waitForFunction(() => window.__ready || window.__error, null, { timeout: 180000 });
const err = await page.evaluate(() => window.__error);
if (err) { console.error(err + '\n' + logs.join('\n')); process.exit(1); }
const { duration, fps } = await page.evaluate(() => window.__shot);
const canvas = page.locator('canvas');

if (stills) {
  const dir = path.join(ROOT, 'out', 'stills', name);
  fs.mkdirSync(dir, { recursive: true });
  for (const t of stills.split(',').map(Number)) {
    await page.evaluate((tt) => window.__frame(tt), t);
    const file = path.join(dir, `${name}-${t.toFixed(2)}s.png`);
    await canvas.screenshot({ path: file });
    console.log(file);
  }
} else {
  const dir = path.join(ROOT, 'out', 'frames', name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const n = Math.round(duration * fps);
  const started = Date.now();
  for (let i = 0; i < n; i++) {
    await page.evaluate((tt) => window.__frame(tt), i / fps);
    await canvas.screenshot({ path: path.join(dir, `${String(i).padStart(5, '0')}.png`) });
    if (i % 30 === 29 || i === n - 1) console.log(`${name}: frame ${i + 1}/${n}  (${((Date.now() - started) / (i + 1) / 1000).toFixed(2)} s/frame)`);
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', String(fps), '-i', path.join(dir, '%05d.png'),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outFile], { stdio: 'inherit' });
  console.log(outFile);
}
if (logs.length) console.log('console:\n  ' + logs.join('\n  '));
await browser.close();
server.close();
