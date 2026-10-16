# Announcement film: shot spec

A 30-second "coming soon" announcement for investors. It's Apple-like: calm, dark and precise, with slow camera moves.
**There is no product name and no logo yet: nothing in any frame may show a name, logo, wordmark or brand mark.**
Narration is a voiceover over an original score; there are no subtitles. The only on-screen text in the whole film is the
end title ("Coming soon"), added in the edit, and the generic brief on the monitor in shot 6.

## Timeline (locked)

| # | Shot file | Edit in–out | Render length | Voiceover over this shot |
|---|---|---|---|---|
| 1 | `shots/marble.js` | 0.0–4.6 | 5.0 s | "Aristotle did his best thinking on foot." |
| 2 | `shots/noise.js` | 4.6–8.6 | 4.5 s | "Somewhere along the way, we started thinking with our heads down." |
| 3 | `shots/reveal.js` (done) | 8.6–14.1 | 6.0 s | "No screen. No feed. Just your voice." |
| 4 | `shots/listen.js` | 14.1–19.6 | 6.0 s | "Think out loud. While you walk, agents build the work on your own computer." |
| 5 | `shots/cabin.js` | 19.6–24.6 | 5.5 s | "Offline at forty-one thousand feet. Done when you land." |
| 6 | `shots/desk.js` | 24.6–27.6 | 3.5 s | "Come back to finished work." |
| 7 | `shots/end.js` | 27.6–30.6 | 3.5 s | "Coming soon." (title added in the edit) |

The edit uses each shot from t = 0 and trims the tail, so the last ~0.4 s of every render is a handle.

## Rules for every shot

- 1920 × 1080, 30 fps. Final render: `node render-shot.mjs shots/<name>.js` → `out/<name>.mp4` (about 2 s per frame in
  software WebGL; keep any scene under ~4 s per frame). Quick previews: `node render-shot.mjs shots/<name>.js --w 960 --h 540 --stills 0.5,1.5,3`.
- Look: near-black and neutral greys, with warm-white light (`#fff4e6`) as the only accent. **No brand blue, no
  saturated colours** (the sky outside the jet window is the one natural exception). The device's light is warm white.
- Camera: one slow, continuous move per shot (a dolly, push or gentle orbit) with eased starts and ends. No cuts inside
  a shot, no shake, no fast moves (there is no motion blur).
- Everything is procedural: geometry in three.js, textures drawn on a canvas. **No downloaded images, models or fonts.**
- Watch for bloom blow-outs: the bloom threshold is high (2.6 in linear HDR), but a polished face reflecting a bright
  light at a grazing angle can still flare. Keep highlights crisp, not blooming patches.
- Don't edit the shared files (`lib/`, `motion.js`, `device/`, `render*.mjs`, `studio.*`). A shot changes the stage
  in its own `setup()`: hide or recolour the floor, replace `scene.background`, dim or move `stage.lights`, add lights and
  meshes. Set `export const device = false` for a shot without the device.
- Device controls: `device.anim.setSlit(k)` (front light slit, 0–1+) and `device.anim.setTouch(k)` (the hidden
  sensor's single ring of light, 0–1). `device.object` is the device group (102 × 46 × 13.5 mm, resting on y = 0,
  centred at the origin, long axis on x, the light slit on the +z face). Units are millimetres.
- `shots/reveal.js` is the reference for structure, pacing and the studio look.

## Shot briefs

**1 · marble: the Lyceum.** Early morning in an ancient Greek colonnade. A row of fluted white-marble columns on a
stone floor, low warm sunlight raking through them and laying long soft shadows across the floor. Fade up from black
over the first ~0.6 s. Slow push or lateral dolly along the colonnade. No people, statues or text. A calm, timeless,
sunlit stillness. Procedural marble: warm off-white with faint grey veining.

**2 · noise: heads down.** A dark void filling with glowing notification cards: generic rounded rectangles with a
small circle where an icon would be and two or three grey bars where text would be. No readable text, no app icons.
They pop in faster and faster, overlapping in depth, with a cool neutral screen-glow on near-black. The camera eases
back to show how overwhelming the pile is. From ~3.2 s everything falls away and dissolves downward into darkness; the
frame is fully black by 4.2 s, because shot 3 starts in black.

**4 · listen: voice becomes work.** A close, high three-quarter view of the device's clean ceramic top in the dark
studio. Fade in over ~0.5 s. At ~0.8 s the hidden sensor wakes (`setTouch` eases 0 → 1): a ring of light under the
implied thumb, with no hand shown. From ~1.4 s the slit pulses with a speech-like rhythm (`setSlit`), as the voice. From
~2.4 s, 5–9 thin threads of warm-white light stream out of the device across the dark floor into the distance, toward
a computer that is never shown. They are fibre-optic-like, with bright pulses travelling along them and gentle curves.
The camera slowly pulls back and rises to reveal the threads reaching far into the dark.

**5 · cabin: forty-one thousand feet.** A private-jet cabin at altitude. A cream or ivory cabin wall with one large
oval window in a recessed frame. Outside, a sunlit sea of cloud tops under a pale sky drifts slowly past. Warm sun from
the window falls across a polished walnut side table where the device lies, its slit breathing softly. A cut-crystal
glass or a cream leather seat edge may sit at the frame's edge for scale and luxury. Slow lateral dolly along the table
toward the window. Quiet, expensive, unhurried.

**6 · desk: come back to finished work.** A dark premium study at dusk: a desk, a large thin-bezel monitor with no
logos, and the device lying beside the keyboard area with its slit off. Behind, a window with soft city lights out of
focus. The monitor shows a clean, dark, one-page brief in a modern sans-serif: a title "While you were away"; a "Done"
section with "Prototype built and running", "Pitch deck — 12 slides" and "Pricing charts", each with a small check mark;
and a "Needs your decision" section with "Choose the pricing tier" and a small amber dot. The text must be readable at
1080p and must contain no product name. Slow push toward the screen.

**7 · end: coming soon.** Black. The device at the hero angle in a single pool of light, slit breathing. The light rises
gently over the first second and the camera barely moves. Leave clear dark space in the lower third for the title,
which is added in the edit.
