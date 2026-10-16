"""Voiceover for the announcement film, spoken by Kokoro-82M (Apache-2.0, runs locally on CPU).

    python audio/voice.py out/audio/vo        # needs: pip install kokoro soundfile (Python 3.10–3.12)

Writes one WAV per line (24 kHz mono) plus lines.json with each line's cue and spoken length.
The cues follow the SHOTS.md timeline; mix.py places the lines and checks that none runs into the next.
"""
import json
import os
import sys

import numpy as np
import soundfile as sf
from kokoro import KPipeline

VOICE = os.environ.get('VO_VOICE', 'af_heart')   # Kokoro's highest-rated English voice: calm and warm
SPEED = float(os.environ.get('VO_SPEED', '0.92'))

LINES = [  # (cue in seconds, text)
    (0.5, 'Aristotle did his best thinking on foot.'),
    (4.9, 'Somewhere along the way, we started thinking with our heads down.'),
    (10.4, 'No screen. No feed. Just your voice.'),
    (14.6, 'Think out loud. While you walk, agents build the work on your own computer.'),
    (19.9, 'Offline, at forty-one thousand feet. Done when you land.'),
    (24.9, 'Come back to finished work.'),
    (28.1, 'Coming soon.'),
]


def trim(x, thresh=0.01, pad=0.04, sr=24000):
    idx = np.where(np.abs(x) > thresh)[0]
    if len(idx) == 0:
        return x
    a = max(0, idx[0] - int(pad * sr))
    b = min(len(x), idx[-1] + int(pad * sr))
    return x[a:b]


def main(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    pipe = KPipeline(lang_code='a')
    meta = []
    for i, (cue, text) in enumerate(LINES, 1):
        chunks = [np.asarray(audio) for _, _, audio in pipe(text, voice=VOICE, speed=SPEED)]
        x = trim(np.concatenate(chunks).astype(np.float32))
        path = os.path.join(out_dir, f'line{i}.wav')
        sf.write(path, x, 24000)
        meta.append({'line': i, 'cue': cue, 'text': text, 'file': path, 'seconds': round(len(x) / 24000, 3)})
        print(f'line {i}: {len(x) / 24000:.2f} s  "{text}"')
    with open(os.path.join(out_dir, 'lines.json'), 'w') as f:
        json.dump({'voice': VOICE, 'speed': SPEED, 'lines': meta}, f, indent=2)


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else 'vo')
