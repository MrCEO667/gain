"""Mix the voiceover over the score: place each line at its cue, duck the music under the voice, write a 48 kHz WAV.

    python3 audio/mix.py out/audio/score.wav out/audio/vo/lines.json out/audio/mix.wav

Fails loudly if a line would run into the next cue or past the end of the film. Loudness is set in the final encode.
"""
import json
import sys
import wave

import numpy as np

SR = 48000


def read_wav(path):
    with wave.open(path, 'rb') as w:
        sr, ch, n = w.getframerate(), w.getnchannels(), w.getnframes()
        width = w.getsampwidth()
        raw = w.readframes(n)
    if width == 2:
        x = np.frombuffer(raw, '<i2').astype(np.float64) / 32768
    elif width == 4:
        x = np.frombuffer(raw, '<i4').astype(np.float64) / 2 ** 31
    else:
        raise ValueError(f'{path}: unsupported sample width {width}')
    return sr, x.reshape(-1, ch).T


def resample(x, sr_in, sr_out):
    if sr_in == sr_out:
        return x
    n_out = int(round(len(x) * sr_out / sr_in))
    return np.interp(np.arange(n_out) * sr_in / sr_out, np.arange(len(x)), x)


def one_pole(x, hz):
    a = 1 - np.exp(-2 * np.pi * hz / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += a * (x[i] - acc)
        y[i] = acc
    return y


def follower(x, attack=0.04, release=0.35):
    """Envelope follower with separate attack and release times (seconds)."""
    ka, kr = np.exp(-1 / (attack * SR)), np.exp(-1 / (release * SR))
    env = np.empty_like(x)
    e = 0.0
    for i, v in enumerate(np.abs(x)):
        k = ka if v > e else kr
        e = k * e + (1 - k) * v
        env[i] = e
    return env


def main(score_path, lines_path, out_path):
    sr, music = read_wav(score_path)
    assert sr == SR, f'score must be {SR} Hz'
    n = music.shape[1]
    meta = json.load(open(lines_path))['lines']
    vo = np.zeros(n)
    target_rms = 0.11
    for i, line in enumerate(meta):
        vsr, x = read_wav(line['file'])
        x = resample(x[0], vsr, SR)
        x = x - one_pole(x, 80)                      # high-pass: no low rumble under the music
        rms = np.sqrt(np.mean(x[np.abs(x) > 0.01] ** 2))
        x *= target_rms / (rms + 1e-9)               # every line at the same level
        start = int(line['cue'] * SR)
        end = start + len(x)
        limit = int(meta[i + 1]['cue'] * SR) if i + 1 < len(meta) else n
        if end > limit - int(0.12 * SR):
            raise SystemExit(f'line {line["line"]} ({line["seconds"]} s from {line["cue"]} s) runs into the next cue at {limit / SR:.2f} s')
        vo[start:end] += x
        print(f'line {line["line"]}: {line["cue"]:5.2f}–{end / SR:5.2f} s  (next cue {limit / SR:5.2f})')

    # duck the music by up to 8 dB while the voice speaks
    env = follower(vo, 0.03, 0.45)
    duck = 10 ** (-8 * np.clip(env / 0.05, 0, 1) / 20)
    mix = music * duck * 0.62 + vo[None, :] * 1.0
    peak = np.abs(mix).max()
    if peak > 0.98:
        mix *= 0.98 / peak
    pcm = (np.clip(mix.T, -1, 1) * 32767).astype('<i2')
    with wave.open(out_path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())
    print(f'{out_path}: {n / SR:.2f} s')


if __name__ == '__main__':
    main(*sys.argv[1:4])
