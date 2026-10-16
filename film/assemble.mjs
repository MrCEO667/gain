// Cut the rendered shots into the film, add the end title and lay in the mixed audio.
// Usage: node assemble.mjs [--out out/film.mp4] [--mix out/audio/mix.wav] [--no-audio] [--placeholders]
// Expects out/<shot>.mp4 for every shot in EDIT (see SHOTS.md). Loudness is normalised to -16 LUFS for the web.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.dirname(new URL(import.meta.url).pathname);
const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : def; };
const outFile = path.resolve(opt('out', path.join(ROOT, 'out', 'film.mp4')));
const mixFile = path.resolve(opt('mix', path.join(ROOT, 'out', 'audio', 'mix.wav')));
const withAudio = !argv.includes('--no-audio');
const placeholders = argv.includes('--placeholders');   // grey slates for shots not rendered yet

// Each shot is used from t = 0 for `len` seconds (SHOTS.md timeline).
const EDIT = [
  { shot: 'marble', len: 4.6 },
  { shot: 'noise', len: 4.0 },
  { shot: 'reveal', len: 5.5 },
  { shot: 'listen', len: 5.5 },
  { shot: 'cabin', len: 5.0 },
  { shot: 'desk', len: 3.0 },
  { shot: 'end', len: 3.0 },
];
const TOTAL = EDIT.reduce((s, e) => s + e.len, 0);
const TITLE = { text: 'Coming soon', at: 28.1, fadeIn: 0.7 };
const NOTE = { text: 'Concept render', at: 28.4 };
const FONT_TITLE = '/usr/share/fonts/opentype/inter/InterDisplay-Light.otf';
const FONT_NOTE = '/usr/share/fonts/opentype/inter/Inter-Regular.otf';

const inputs = [];
for (const e of EDIT) {
  const f = path.join(ROOT, 'out', `${e.shot}.mp4`);
  if (fs.existsSync(f)) inputs.push('-t', String(e.len), '-i', f);
  else if (placeholders) inputs.push('-f', 'lavfi', '-t', String(e.len), '-i', `color=c=0x16161a:s=1920x1080:r=30`);
  else { console.error(`missing ${f}`); process.exit(2); }
}
if (withAudio) {
  if (!fs.existsSync(mixFile)) { console.error(`missing ${mixFile}`); process.exit(2); }
  inputs.push('-i', mixFile);
}

const alpha = (t0, d) => `if(lt(t,${t0}),0,if(lt(t,${t0 + d}),(t-${t0})/${d},1))`;
const filters = [
  EDIT.map((_, i) => `[${i}:v]settb=AVTB,setpts=PTS-STARTPTS,fps=30,format=yuv420p[v${i}]`).join(';'),
  `${EDIT.map((_, i) => `[v${i}]`).join('')}concat=n=${EDIT.length}:v=1:a=0[cut]`,
  `[cut]drawtext=fontfile=${FONT_TITLE}:text='${TITLE.text}':fontsize=58:fontcolor=0xf4efe6:x=(w-text_w)/2:y=h*0.70:alpha='${alpha(TITLE.at, TITLE.fadeIn)}',` +
    `drawtext=fontfile=${FONT_NOTE}:text='${NOTE.text}':fontsize=17:fontcolor=0xf4efe6@0.45:x=w-text_w-48:y=h-text_h-40:alpha='${alpha(NOTE.at, 0.6)}',` +
    `fade=t=out:st=${(TOTAL - 0.45).toFixed(2)}:d=0.45[v]`,
].join(';');

const args = ['-loglevel', 'error', '-y', ...inputs, '-filter_complex', filters, '-map', '[v]'];
if (withAudio) {
  args.push('-map', `${EDIT.length}:a`, '-af', `atrim=0:${TOTAL},loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=out:st=${(TOTAL - 0.5).toFixed(2)}:d=0.5`,
    '-c:a', 'aac', '-b:a', '256k', '-ar', '48000');
}
args.push('-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', '30', '-t', String(TOTAL), '-movflags', '+faststart', outFile);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
execFileSync('ffmpeg', args, { stdio: 'inherit' });
console.log(`${outFile}  (${TOTAL.toFixed(1)} s)`);
