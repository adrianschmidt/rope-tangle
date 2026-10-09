import { cloneDiagram, createDiagram, cyclicOrder, reduce, type Diagram } from "../src/diagram";
import { moveEnd } from "../src/diagram/move";
import { checkConsistent, pairSequence } from "../src/diagram/queries";
import { mulberry32 } from "../src/util/rng";

function randomDiagrams(count: number): Diagram[] {
  const rng = mulberry32(11);
  const out: Diagram[] = [];
  for (let k = 0; k < count; k++) {
    const n = 2 + (k % 5);
    const d = createDiagram(n);
    for (let step = 0; step < 12; step++) {
      const rope = Math.floor(rng() * n), end = rng() < 0.5 ? 0 : 1;
      const order = cyclicOrder(d, { rope, end });
      const i = Math.floor(rng() * order.length);
      moveEnd(d, rope, end, { after: order[i]!, before: order[(i + 1) % order.length]! });
    }
    out.push(d);
  }
  return out;
}

describe("reduce", () => {
  const diagrams = randomDiagrams(200);

  it("finds bigons to remove in random diagrams", () => {
    expect(diagrams.filter((d) => reduce(d).crossings.size < d.crossings.size).length).toBeGreaterThan(10);
  });

  it("removes crossings in pairs between the same ropes, leaves the input alone, and is idempotent", () => {
    for (const d of diagrams) {
      const before = cloneDiagram(d);
      const r = reduce(d);
      expect(d).toEqual(before);
      checkConsistent(r);
      for (let a = 0; a < d.ropes.length; a++) for (let b = a; b < d.ropes.length; b++) {
        expect((pairSequence(d, a, b).length - pairSequence(r, a, b).length) % 2).toBe(0);
      }
      expect(reduce(r)).toEqual(r);
    }
  });
});
