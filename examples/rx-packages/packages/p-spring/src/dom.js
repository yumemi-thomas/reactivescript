/** The spring's steps (a damped oscillator per frame, as the original's), told to `f`. */
export function spring(initial, f) {
  let current = initial, last = initial, target = initial, raf = 0, resolve;
  const step = (o) => { const { stiffness = 0.15, damping = 0.8, precision = 0.01 } = o;
    const go = (c, l, t) => { if (typeof c === "number") { const v = c - l, s = stiffness * (t - c), d = damping * v, n = c + v + s - d; return [n, Math.abs(n - c) < precision && Math.abs(t - n) < precision]; } const out = Array.isArray(c) ? [] : {}; let settled = true; for (const k in c) { const [n, done] = go(c[k], l[k], t[k]); out[k] = n; settled &&= done; } return [out, settled]; };
    const [n, done] = go(current, last, target); last = current; current = done ? target : n; f(current, !done); if (done) { raf = 0; resolve?.(); } else raf = requestAnimationFrame(() => step(o)); };
  return { set(t, options, opts = {}) { const o = typeof options === "function" ? options() : options ?? {}; target = typeof t === "function" ? t(target) : t; if (opts.hard || (o.stiffness >= 1 && o.damping >= 1)) { cancelAnimationFrame(raf); raf = 0; last = current = target; f(current, false); return Promise.resolve(); } if (!raf) raf = requestAnimationFrame(() => step(o)); return new Promise((r) => { resolve = r; }); }, stop() { cancelAnimationFrame(raf); } };
}
