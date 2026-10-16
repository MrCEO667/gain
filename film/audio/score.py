"""Original score for the announcement film, synthesised with numpy and timed to the edit (SHOTS.md timeline).

    python3 audio/score.py out/audio/score.wav

Sections: warm open fifths for the marble colonnade; accelerating notification ticks and a riser that cut to silence as
the cards fall away; a low swell and a shimmer that follows the light sweep in the reveal; a slow arpeggio (Dmaj9, Bm9,
Gmaj7, Asus) under "voice becomes work", the cabin and the desk; a final swell and bell for "Coming soon".
"""
import sys
import wave

import numpy as np

SR = 48000
DUR = 30.6
N = int(SR * DUR)
rng = np.random.default_rng(7)

dry = np.zeros((2, N))   # mixed straight to the master
send = np.zeros((2, N))  # also fed to the reverb


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def place(sig, t0, pan=0.0, gain=1.0, rev=0.3):
    """Add a mono signal at t0 seconds. pan in [-1, 1] (scalar or per-sample array), rev = reverb send."""
    i = int(round(t0 * SR))
    if i >= N:
        return
    seg = sig[: N - i] * gain
    p = pan if np.isscalar(pan) else pan[: len(seg)]
    lg, rg = np.cos((np.asarray(p) + 1) * np.pi / 4), np.sin((np.asarray(p) + 1) * np.pi / 4)
    dry[0, i : i + len(seg)] += seg * lg
    dry[1, i : i + len(seg)] += seg * rg
    send[0, i : i + len(seg)] += seg * lg * rev
    send[1, i : i + len(seg)] += seg * rg * rev


def fade(n, attack, release):
    t = np.arange(n) / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    r = np.clip((n / SR - t) / max(release, 1e-4), 0, 1)
    return np.sin(a * np.pi / 2) ** 2 * np.sin(r * np.pi / 2) ** 2


def pad(notes, dur, attack=1.5, release=1.5, cutoff=1300.0, detune=7.0):
    """Warm detuned additive pad: soft saw-like partials rolled off above `cutoff`."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for m in notes:
        f0 = mtof(m)
        for v in (-1, 0, 1):
            f = f0 * 2 ** (v * detune / 1200)
            ph = rng.random() * 2 * np.pi
            for h in range(1, 14):
                fh = f * h
                if fh > 9000:
                    break
                w = (1 / h) / (1 + (fh / cutoff) ** 2)
                out += w * np.sin(2 * np.pi * fh * t + ph * h)
    out /= max(1, len(notes)) * 3
    # slow breathing so long pads don't sound static
    out *= 0.85 + 0.15 * np.sin(2 * np.pi * 0.11 * t + rng.random() * 6)
    return out * fade(n, attack, release)


def bell(m, dur=4.5, index=2.2, ratio=3.5, decay=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = mtof(m)
    menv = np.exp(-t * 3.2)
    sig = np.sin(2 * np.pi * f * t + index * menv * np.sin(2 * np.pi * f * ratio * t))
    sig += 0.25 * np.sin(2 * np.pi * f * 2.0 * t) * np.exp(-t * 2.5)
    return sig * np.exp(-t * decay) * np.clip(t / 0.004, 0, 1)


def pluck(m, dur=2.8):
    """Soft felt-piano-like tone: a few decaying partials, slightly stretched."""
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = mtof(m)
    sig = np.zeros(n)
    for k, amp, dec in ((1, 1.0, 1.4), (2, 0.38, 2.4), (3, 0.14, 3.6), (4, 0.06, 5.0)):
        sig += amp * np.sin(2 * np.pi * f * k * (1 + 0.0004 * k * k) * t) * np.exp(-t * dec)
    return sig * np.clip(t / 0.006, 0, 1) * fade(n, 0.0, 0.3)


def boom(dur=4.0, f0=52.0, f1=38.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-t * 1.5)
    ph = 2 * np.pi * np.cumsum(f) / SR
    sig = np.sin(ph) + 0.3 * np.sin(2 * ph)
    return sig * np.clip(t / 0.25, 0, 1) * np.exp(-t * 0.7)


def sub(m, dur, attack=0.6, release=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    f = mtof(m)
    return (np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t)) * fade(n, attack, release)


def lowpass_var(x, cutoff):
    """One-pole low-pass with a per-sample cutoff (Hz)."""
    a = 1 - np.exp(-2 * np.pi * np.asarray(cutoff) / SR)
    a = np.broadcast_to(a, x.shape)
    y = np.empty_like(x)
    acc = 0.0
    for i in range(len(x)):
        acc += a[i] * (x[i] - acc)
        y[i] = acc
    return y


def noise_bed(dur, cutoff=1800.0):
    n = int(dur * SR)
    x = rng.standard_normal(n)
    y = lowpass_var(lowpass_var(x, cutoff), cutoff)
    return y / (np.abs(y).max() + 1e-9) * fade(n, 1.2, 1.2)


def riser(dur, c0=250.0, c1=7000.0):
    n = int(dur * SR)
    x = rng.standard_normal(n)
    c = c0 * (c1 / c0) ** (np.arange(n) / n) ** 1.6
    y = lowpass_var(x, c) - lowpass_var(x, c * 0.35)
    y /= np.abs(y).max() + 1e-9
    return y * (np.arange(n) / n) ** 2.2


def tick(freq):
    n = int(0.09 * SR)
    t = np.arange(n) / SR
    return np.sin(2 * np.pi * freq * t) * np.exp(-t * 55) * np.clip(t / 0.0015, 0, 1)


# ---------------------------------------------------------------- 1 · marble (0.0–4.6): warm open fifths, air, two bells
place(pad([38, 45, 50, 57], 5.1, attack=1.6, release=0.8, cutoff=1100), 0.0, gain=0.36, rev=0.25)
place(noise_bed(5.0, 1500), 0.0, gain=0.035, rev=0.2)
place(bell(74, decay=0.9), 0.45, pan=-0.25, gain=0.16, rev=0.6)
place(bell(81, decay=1.1), 2.35, pan=0.3, gain=0.09, rev=0.7)

# ---------------------------------------------------------------- 2 · noise (4.6–8.6): tension, ticks, riser, hard cut at 8.15
place(pad([34, 41, 46, 48], 3.75, attack=0.9, release=0.06, cutoff=900), 4.42, gain=0.42, rev=0.2)
tick_times, t, gap = [], 4.75, 0.36
while t < 8.08:
    tick_times.append(t)
    gap = max(0.028, gap * 0.86)
    t += gap * (0.75 + 0.5 * rng.random())
pent = [84, 86, 88, 91, 93, 96, 98, 100]
for i, tt in enumerate(tick_times):
    place(tick(mtof(pent[rng.integers(len(pent))])), tt, pan=float(rng.uniform(-0.75, 0.75)), gain=float(0.07 + 0.08 * i / len(tick_times)), rev=0.5)
place(riser(2.55), 5.6, gain=0.16, rev=0.15)
CUT0, CUT1 = 8.12, 8.2   # everything before here is gated to silence (the cards fall away into black)
pre_dry, pre_send = dry.copy(), send.copy()
dry[:], send[:] = 0, 0

# ---------------------------------------------------------------- 3 · reveal (8.6–14.1): swell, shimmer following the sweep, wake bell
place(boom(4.5), 8.75, gain=0.55, rev=0.15)
sh = pad([86, 93], 3.0, attack=1.0, release=1.2, cutoff=6000, detune=12)
place(sh, 8.9, pan=np.linspace(-0.8, 0.8, len(sh)), gain=0.10, rev=0.6)
place(pad([38, 50, 57, 61, 64], 4.4, attack=2.2, release=1.0, cutoff=1500), 10.3, gain=0.45, rev=0.3)
place(bell(81, decay=0.8), 12.8, pan=-0.15, gain=0.11, rev=0.6)
place(bell(86, decay=0.9), 12.83, pan=0.2, gain=0.08, rev=0.7)

# ---------------------------------------------------------------- 4–6 · listen, cabin, desk (14.1–27.6): arpeggio at 84 bpm
EIGHTH = 60 / 84 / 2
chords = [  # (start, end, arpeggio notes, pad notes, bass)
    (14.1, 16.9, [62, 66, 69, 73, 76, 73, 69, 66], [50, 57, 61, 64], 38),
    (16.9, 19.6, [59, 62, 66, 69, 73, 69, 66, 62], [47, 54, 57, 61], 35),
    (19.6, 22.3, [55, 59, 62, 66, 69, 66, 62, 59], [43, 50, 54, 57], 31),
    (22.3, 24.6, [57, 62, 64, 69, 74, 69, 64, 62], [45, 50, 52, 57], 33),
    (24.6, 27.6, [62, 66, 69, 73, 76, 73, 69, 66], [50, 54, 57, 61, 64], 38),
]
ARP_START = 14.85   # the hidden sensor wakes
for ci, (c0, c1, arp, chord, bass) in enumerate(chords):
    place(pad(chord, c1 - c0 + 1.0, attack=0.9, release=1.0, cutoff=1400), c0 - 0.3, gain=0.36, rev=0.3)
    place(sub(bass, c1 - c0 + 0.6), c0 - 0.1, gain=0.22, rev=0.05)
    step = EIGHTH * (2 if ci == 4 else 1)   # the desk thins to quarter notes
    k, tt = 0, max(c0, ARP_START)
    while tt < c1 - 0.05:
        build = min(1.0, (tt - ARP_START) / 3.0)   # the arpeggio grows in over its first bars
        thin = 1.0 if ci < 4 else max(0.0, 1 - (tt - c0) / 3.2)
        place(pluck(arp[k % len(arp)]), tt, pan=0.35 * np.sin(k * 0.9), gain=0.13 * (0.35 + 0.65 * build) * thin, rev=0.45)
        k += 1
        tt += step
place(noise_bed(5.2, 2500), 19.5, gain=0.03, rev=0.3)          # air at altitude
place(bell(78, decay=0.9), 24.7, pan=0.2, gain=0.09, rev=0.6)   # "come back to finished work"

# ---------------------------------------------------------------- 7 · end (27.6–30.6): final swell and bell for "Coming soon"
place(boom(3.0, 46, 36), 27.62, gain=0.35, rev=0.2)
place(pad([38, 45, 50, 54, 57], 3.1, attack=0.7, release=1.2, cutoff=1300), 27.55, gain=0.5, rev=0.35)
place(bell(74, decay=0.7), 28.15, pan=-0.1, gain=0.14, rev=0.7)
place(bell(81, decay=0.8), 28.18, pan=0.15, gain=0.07, rev=0.7)


# ---------------------------------------------------------------- reverb (synthetic hall) and master
def reverb(x, seconds=2.8, decay=2.4):
    n = int(seconds * SR)
    t = np.arange(n) / SR
    out = np.zeros_like(x)
    for ch in range(2):
        ir = rng.standard_normal(n) * np.exp(-t * decay)
        ir = lowpass_var(ir, 5200)
        ir[: int(0.018 * SR)] = 0   # pre-delay
        ir /= np.sqrt((ir ** 2).sum())
        m = 1 << int(np.ceil(np.log2(len(x[ch]) + n)))
        out[ch] = np.fft.irfft(np.fft.rfft(x[ch], m) * np.fft.rfft(ir, m), m)[: len(x[ch])]
    return out


gate = np.ones(N)
i0, i1 = int(CUT0 * SR), int(CUT1 * SR)
gate[i0:i1] = np.linspace(1, 0, i1 - i0)
gate[i1:] = 0
pre = (pre_dry + 0.9 * reverb(pre_send)) * gate
post = dry + 0.9 * reverb(send)
mix = pre + post
fade_out = np.ones(N)
k0 = int((DUR - 0.9) * SR)
fade_out[k0:] = np.linspace(1, 0, N - k0) ** 1.5
mix *= fade_out
mix = np.tanh(mix * 1.2) / 1.2
mix *= 10 ** (-1 / 20) / (np.abs(mix).max() + 1e-9)   # peak at -1 dBFS; the final mix sets loudness

out = sys.argv[1] if len(sys.argv) > 1 else 'score.wav'
pcm = (np.clip(mix.T, -1, 1) * 32767).astype('<i2')
with wave.open(out, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes(pcm.tobytes())
print(f'{out}: {DUR:.1f} s, {len(tick_times)} ticks')
