// Small easing and keyframe helpers for shots. Time is in seconds.
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const lerp = (a, b, k) => a + (b - a) * k;
export const smooth = (x) => { const t = clamp(x); return t * t * (3 - 2 * t); };
export const easeInOut = (x) => { const t = clamp(x); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export const easeOut = (x) => 1 - Math.pow(1 - clamp(x), 3);

// 0 before t0, 1 after t1, eased in between.
export const ramp = (t, t0, t1, ease = smooth) => ease((t - t0) / (t1 - t0));

// Interpolate arrays (positions, targets) between keyframes [{ t, v: [...] }], eased per segment.
export function track(keys, t, ease = easeInOut) {
  if (t <= keys[0].t) return keys[0].v.slice();
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t <= b.t) { const k = ease((t - a.t) / (b.t - a.t)); return a.v.map((x, j) => lerp(x, b.v[j], k)); }
  }
  return keys[keys.length - 1].v.slice();
}
