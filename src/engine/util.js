// Small shared helpers. No DOM, no clock, no Math.random.

export class EngineError extends Error {
  constructor(code, message, details) {
    super(message ? `${code}: ${message}` : code);
    this.name = 'EngineError';
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export function fail(code, message, details) {
  throw new EngineError(code, message, details);
}

export const clone = (o) => (o === undefined ? undefined : JSON.parse(JSON.stringify(o)));

export const ceilDiv = (a, b) => Math.ceil(a / b);
export const floorDiv = (a, b) => Math.floor(a / b);
export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export function uniq(arr) {
  return [...new Set(arr)];
}

export function sum(arr) {
  let t = 0;
  for (const x of arr) t += x;
  return t;
}

export function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) if (!deepEqual(a[k], b[k])) return false;
  return true;
}

/** FNV-1a 32-bit, hex. Used for content version strings (not cryptographic). */
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
