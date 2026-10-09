import { cloneDiagram, createDiagram, cyclicOrder, DiagramDegenerate, endPos, gapContaining, gapOf, type Diagram, type EndRef, type Gap } from "../src/diagram";
import { liftedStretch, moveEnd } from "../src/diagram/move";
import { alternate, checkConsistent, crossingCount, isHooked, pairSequence } from "../src/diagram/queries";
import { TAU } from "../src/diagram/geometry";
import { mulberry32 } from "../src/util/rng";

const deg = (x: number) => (x / 360) * TAU;

function twoRopes(): Diagram {
  return createDiagram(2); // A: 0°→90°, B: 180°→270°
}

describe("moveEnd", () => {
  it("creates a single over-crossing when the move makes two ropes alternate", () => {
    const d = twoRopes();
    const gap: Gap = { after: { rope: 1, end: 0 }, before: { rope: 1, end: 1 } };
    moveEnd(d, 0, 1, gap);
    expect(endPos(d, { rope: 0, end: 1 }).angle).toBeCloseTo(deg(225));
    expect(pairSequence(d, 0, 1)).toEqual(["over"]);
    expect(pairSequence(d, 1, 0)).toEqual(["under"]);
    expect(alternate(d, 0, 1)).toBe(true);
    checkConsistent(d);
  });

  it("hooks a rope that was under when its end is moved back across", () => {
    const d = twoRopes();
    moveEnd(d, 0, 1, { after: { rope: 1, end: 0 }, before: { rope: 1, end: 1 } });
    moveEnd(d, 1, 0, { after: { rope: 1, end: 1 }, before: { rope: 0, end: 0 } });
    expect(endPos(d, { rope: 1, end: 0 }).angle).toBeCloseTo(deg(315));
    expect(pairSequence(d, 1, 0)).toEqual(["over", "under"]);
    expect(pairSequence(d, 1, 0, 1)).toEqual(["under", "over"]);
    expect(isHooked(d, 0, 1)).toBe(true);
    expect(alternate(d, 0, 1)).toBe(false);
    expect(crossingCount(d, 1)).toBe(2);
    checkConsistent(d);
  });

  it("lifts the whole rope when it has no under-crossings and removes its over-crossings", () => {
    const d = twoRopes();
    moveEnd(d, 0, 1, { after: { rope: 1, end: 0 }, before: { rope: 1, end: 1 } });
    expect(liftedStretch(d, 0, 1)).toHaveLength(1);
    moveEnd(d, 0, 1, { after: { rope: 0, end: 0 }, before: { rope: 1, end: 0 } });
    expect(d.crossings.size).toBe(0);
    expect(d.ropes[0]!.vertices).toHaveLength(2);
    checkConsistent(d);
  });

  it("moving an end back into the gap it came from undoes a plain crossing", () => {
    const d = twoRopes();
    const home = gapOf(d, { rope: 0, end: 1 });
    moveEnd(d, 0, 1, { after: { rope: 1, end: 0 }, before: { rope: 1, end: 1 } });
    moveEnd(d, 0, 1, home);
    expect(d.crossings.size).toBe(0);
    expect(pairSequence(d, 0, 1)).toEqual([]);
    checkConsistent(d);
  });

  it("moving an end within its own gap keeps the tangle", () => {
    const d = twoRopes();
    moveEnd(d, 0, 1, { after: { rope: 1, end: 0 }, before: { rope: 1, end: 1 } });
    moveEnd(d, 1, 0, { after: { rope: 1, end: 1 }, before: { rope: 0, end: 0 } });
    const before = pairSequence(d, 1, 0);
    moveEnd(d, 1, 0, gapOf(d, { rope: 1, end: 0 }));
    expect(pairSequence(d, 1, 0)).toEqual(before);
    checkConsistent(d);
  });

  it("does not stop the walk at a self-crossing whose over strand is being lifted", () => {
    // A hooks under B, then A's end loops over A's own retained part, then B's end leaves.
    const d = createDiagram(3);
    moveEnd(d, 0, 1, { after: { rope: 1, end: 0 }, before: { rope: 1, end: 1 } });            // A over B
    moveEnd(d, 1, 0, { after: { rope: 1, end: 1 }, before: { rope: 2, end: 0 } });            // B hooks on A
    moveEnd(d, 1, 0, gapContaining(d, endPos(d, { rope: 1, end: 1 }).angle - 0.05, { rope: 1, end: 0 })); // B's end back over its own strand
    const selfLabels = pairSequence(d, 1, 1);
    expect(selfLabels.length === 0 || selfLabels.length === 2).toBe(true);
    checkConsistent(d);
    // Whatever B looks like now, lifting B's end 0 again must leave a consistent diagram and never a dangling hold-down.
    moveEnd(d, 1, 0, { after: { rope: 2, end: 0 }, before: { rope: 2, end: 1 } });
    checkConsistent(d);
    expect(pairSequence(d, 1, 1)).toEqual([]);
  });

  it("keeps the parity invariant and consistency over random moves", () => {
    const rng = mulberry32(3);
    let moves = 0, degenerate = 0;
    for (const n of [2, 3, 5, 8]) {
      const d = createDiagram(n);
      for (let step = 0; step < 150; step++) {
        const ref: EndRef = { rope: Math.floor(rng() * n), end: rng() < 0.5 ? 0 : 1 };
        const order = cyclicOrder(d, ref);
        const i = Math.floor(rng() * order.length);
        const after = order[i]!, before = order[(i + 1) % order.length]!;
        const snap = cloneDiagram(d);
        moves++;
        try {
          moveEnd(d, ref.rope, ref.end, { after: { rope: after.rope, end: after.end }, before: { rope: before.rope, end: before.end } });
        } catch (e) {
          if (!(e instanceof DiagramDegenerate)) throw e;
          degenerate++;
          expect(d).toEqual(snap);
        }
        checkConsistent(d);
        for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
          expect(pairSequence(d, a, b).length % 2 === 1).toBe(alternate(d, a, b));
        }
      }
    }
    expect(degenerate / moves).toBeLessThan(0.02);
  });

  it("is deterministic: the same moves give the same diagram", () => {
    const run = () => {
      const d = createDiagram(4);
      moveEnd(d, 0, 1, { after: { rope: 2, end: 0 }, before: { rope: 2, end: 1 } });
      moveEnd(d, 2, 0, { after: { rope: 3, end: 1 }, before: { rope: 0, end: 0 } });
      moveEnd(d, 1, 1, { after: { rope: 0, end: 1 }, before: { rope: 2, end: 1 } });
      return d;
    };
    expect(run()).toEqual(run());
  });
});
