// lib/thompson-sample.js
// Beta(α,β) draws via independent Gamma samples (no extra deps).

function sampleStandardNormal() {
  return Math.sqrt(-2 * Math.log(Math.random())) * Math.cos(2 * Math.PI * Math.random());
}

/** Gamma(shape, rate=1) using Marsaglia–Tsang; stable for shape >= 1. */
export function sampleGamma(shape) {
  let sh = shape;
  if (sh <= 0) return 0;
  if (sh < 1) return sampleGamma(1 + sh) * Math.pow(Math.random(), 1 / sh);
  const d = sh - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x;
    let v;
    do {
      x = sampleStandardNormal();
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

export function sampleBeta(alpha, beta) {
  const a = Math.max(1e-6, Number(alpha) || 1);
  const b = Math.max(1e-6, Number(beta) || 1);
  const x = sampleGamma(a);
  const y = sampleGamma(b);
  return x / (x + y);
}
