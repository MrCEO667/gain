# Gain concept film

A 30-second, Apple-like concept film for investors: English, on-screen text instead of a voiceover, rendered in code
with three.js in headless Chromium and encoded with ffmpeg. Nothing here is part of the app.

## The device (chosen form)

`device/gain-device.js`: a chamfered octagonal slab, **102 × 46 × 13.5 mm** (≈ 62 cm³).

- A black DLC titanium band whose top chamfer is diamond-cut to bare metal, so one silver line draws the octagon.
- Black zirconia top and back plates. They are RF-transparent, so they also serve as the NFC, Bluetooth and Wi-Fi windows.
- **Clean top.** The fingerprint sensor is hidden under the ceramic. When touched, the logo (ring, inner ring, dot)
  shows through in white light.
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

## Script draft (30 s)

| Time | Picture | On screen |
|---|---|---|
| 0:00–0:04 | Raking light across a fluted marble column | *Aristotle did his best thinking on foot.* |
| 0:04–0:08 | Notifications pile up and blur into noise, then fall away to black | *Today, the best minds are buried in screens.* |
| 0:08–0:13 | **Reveal** (`shots/reveal.js`): a line of light draws the chamfer, the white slit wakes | *Gain. No screen. No feed. Just your voice.* |
| 0:13–0:19 | **Touch**: the logo lights up through the ceramic, then the voice becomes words and the words become work | *Think out loud. Agents build while you move.* |
| 0:19–0:24 | Jet cabin, oval window, clouds. The device on a walnut table, the slit breathing | *Offline at 41,000 feet. Done when you land.* |
| 0:24–0:27 | A desk at dusk with the real Brief page on screen | *Come back to finished work.* |
| 0:27–0:30 | End card: the logo in white light | *Gain. Heads up. Work done.* (small: *Concept film*) |
