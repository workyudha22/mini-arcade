export const TAU = Math.PI * 2;

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Frame-rate independent smoothing. */
export const damp = (a: number, b: number, rate: number, dt: number) =>
  a + (b - a) * (1 - Math.exp(-rate * dt));

export const rand = (min: number, max: number, random: () => number = Math.random) =>
  min + random() * (max - min);

/** Deterministic PRNG for daily challenges. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Shortest signed distance from angle a to angle b, in (-PI, PI]. */
export function angleDelta(a: number, b: number) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

const PREFIX = 'mini-arcade:';

export const store = {
  get(key: string): number {
    const raw = localStorage.getItem(PREFIX + key);
    const n = raw === null ? 0 : Number(raw);
    return Number.isFinite(n) ? n : 0;
  },
  set(key: string, value: number) {
    try {
      localStorage.setItem(PREFIX + key, String(value));
    } catch {
      /* storage blocked, score just won't persist */
    }
  },
};

export const formatScore = (n: number) => n.toLocaleString('id-ID');
