// Counter-based deterministic RNG. State is just { seed, pos } so it serialises
// into the run state and a reload never re-rolls anything that was already drawn.

function hash32(seed, pos) {
  let z = (seed + Math.imul(pos + 1, 0x9e3779b9)) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  z ^= z >>> 16;
  z = Math.imul(z ^ (z >>> 15), 0x2c1b3c6d);
  z = Math.imul(z ^ (z >>> 12), 0x297a2d39);
  z ^= z >>> 15;
  return z >>> 0;
}

/** float in [0,1) for (seed,pos) */
export function floatAt(seed, pos) {
  return hash32(seed >>> 0, pos) / 4294967296;
}

export function newRng(seed) {
  return { seed: seed >>> 0, pos: 0 };
}

/**
 * Draw the next float. `forced` is an optional queue (array) of values that is
 * consumed first (used by tests to inject rolls; never part of saved state).
 */
export function draw(rng, forced) {
  if (forced && forced.length) return forced.shift();
  const v = floatAt(rng.seed, rng.pos);
  rng.pos += 1;
  return v;
}

export function drawInt(rng, n, forced) {
  return Math.min(n - 1, Math.floor(draw(rng, forced) * n));
}

/** In-place Fisher-Yates using the run RNG. */
export function shuffle(rng, arr, forced) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = drawInt(rng, i + 1, forced);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function pick(rng, arr, forced) {
  return arr[drawInt(rng, arr.length, forced)];
}
