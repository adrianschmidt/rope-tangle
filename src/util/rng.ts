export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickWeighted<T>(rng: Rng, items: readonly T[], weight: (item: T) => number): T {
  let total = 0;
  for (const item of items) total += weight(item);
  if (!(total > 0)) throw new Error("pickWeighted: nothing to pick");
  let r = rng() * total;
  for (const item of items) {
    r -= weight(item);
    if (r < 0) return item;
  }
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]!;
    if (weight(item) > 0) return item;
  }
  throw new Error("pickWeighted: nothing to pick");
}
