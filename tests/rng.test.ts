import { mulberry32, pickWeighted } from "../src/util/rng";

describe("mulberry32", () => {
  it("is deterministic per seed and in [0, 1)", () => {
    const a = mulberry32(42), b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe("pickWeighted", () => {
  it("never picks zero-weight items and respects weights roughly", () => {
    const rng = mulberry32(7);
    const counts = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 3000; i++) {
      const k = pickWeighted(rng, ["a", "b", "c"] as const, (x) => ({ a: 3, b: 1, c: 0 })[x]);
      counts[k]++;
    }
    expect(counts.c).toBe(0);
    expect(counts.a).toBeGreaterThan(counts.b * 2);
  });

  it("throws on an empty list or all-zero weights", () => {
    expect(() => pickWeighted(mulberry32(1), [], () => 1)).toThrow();
    expect(() => pickWeighted(mulberry32(1), [1, 2], () => 0)).toThrow();
  });
});
