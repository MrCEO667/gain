# Gain concept film

A 30-second, Apple-like concept film for investors: English, on-screen text instead of a voiceover, rendered in code
with three.js in headless Chromium and encoded with ffmpeg. Nothing here is part of the app.

## The device (chosen form)

`device/gain-device.js`: a chamfered octagonal slab, **102 × 46 × 13.5 mm** (≈ 62 cm³).

- A black DLC titanium band whose top chamfer is diamond-cut to bare metal, so one silver line draws the octagon.
- Black zirconia top and back plates. They are RF-transparent, so they also serve as the NFC, Bluetooth and Wi-Fi windows.
- **Clean top.** The fingerprint sensor is hidden under the ceramic. When touched, a single ring of white light
  shows through.
- No visible button: the click is a pressure-sensing end segment of the band. Four hairline breaks on the corner
  facets split the band into LTE antennas.
- One white light slit on the front edge. Mic ports on the back top chamfer, USB-C on the back wall.

`makeBuild(overrides)` also renders the smaller 72 × 40 × 11.5 mm study and the earlier thumb-dish variant.

## Rendering

Needs Node 22+, ffmpeg and Playwright's Chromium. Playwright is not a dependency: a global install works, or set
`PLAYWRIGHT_MODULE` to its `index.mjs`.

```
cd film
npm install
node render.mjs device hero top profile detail scale beauty touch   # stills → device/renders/
node render-shot.mjs shots/reveal.js                                 # 1080p MP4 → out/reveal.mp4
node render-shot.mjs shots/reveal.js --w 960 --h 540 --stills 1,2,4  # quick test frames → out/stills/
```

A shot is a module in `shots/` exporting `duration` and `setup({ THREE, stage, device })`, which returns
`update(t)`. `device.anim.setSlit(k)` and `device.anim.setTouch(k)` drive the lights. In software WebGL, 1080p
renders at about 2 s per frame.

## The film

`SHOTS.md` has the locked 30-second timeline, the voiceover lines and a brief for each shot. It is a "coming soon"
announcement with **no product name or logo** anywhere. Narration and an original score replace subtitles; the only
title is "Coming soon" at the end.

```
# 1. shots (about 2–4 s per frame each; out/ is git-ignored)
for s in marble noise reveal listen cabin desk end; do node render-shot.mjs shots/$s.js; done

# 2. score: original, synthesised with numpy and timed to the cuts
python3 audio/score.py out/audio/score.wav

# 3. voiceover: Kokoro-82M via kokoro-onnx (pip install kokoro-onnx soundfile; Python 3.10–3.12;
#    model files from github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0)
KOKORO_MODEL=kokoro-v1.0.onnx KOKORO_VOICES=voices-v1.0.bin python audio/voice.py out/audio/vo

# 4. mix (music ducks ~10 dB under the voice) and cut (end title, -16 LUFS, H.264 + AAC)
python3 audio/mix.py out/audio/score.wav out/audio/vo/lines.json out/audio/mix.wav
node assemble.mjs --out out/announcement-film.mp4
```

`node assemble.mjs --placeholders` cuts a rough version with grey slates for shots that aren't rendered yet.
