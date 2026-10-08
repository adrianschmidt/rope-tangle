import { createDiagram, cyclicOrder, endPos, gapContaining, gapMidpoint, gapOf } from "../src/diagram";
import { TAU } from "../src/diagram/geometry";

describe("createDiagram", () => {
  it("places 2n ends evenly and pairs neighbors into non-crossing ropes", () => {
    const d = createDiagram(3);
    expect(d.ropes).toHaveLength(3);
    expect(d.ends).toHaveLength(6);
    expect(d.crossings.size).toBe(0);
    for (const r of d.ropes) {
      expect(r.vertices).toHaveLength(2);
      expect(r.vertices[0]!.kind).toBe("end");
      expect(r.vertices[1]!.kind).toBe("end");
    }
    expect(endPos(d, { rope: 0, end: 0 }).angle).toBeCloseTo(0);
    expect(endPos(d, { rope: 0, end: 1 }).angle).toBeCloseTo(TAU / 6);
    expect(endPos(d, { rope: 2, end: 1 }).angle).toBeCloseTo((5 * TAU) / 6);
  });
});

describe("cyclic order and gaps", () => {
  it("orders ends by angle and can exclude one", () => {
    const d = createDiagram(2);
    expect(cyclicOrder(d).map((e) => [e.rope, e.end])).toEqual([[0, 0], [0, 1], [1, 0], [1, 1]]);
    expect(cyclicOrder(d, { rope: 0, end: 1 }).map((e) => [e.rope, e.end])).toEqual([[0, 0], [1, 0], [1, 1]]);
  });

  it("computes gap midpoints, including across angle 0", () => {
    const d = createDiagram(2);
    expect(gapMidpoint(d, { after: { rope: 0, end: 0 }, before: { rope: 0, end: 1 } })).toBeCloseTo(TAU / 8);
    expect(gapMidpoint(d, { after: { rope: 1, end: 1 }, before: { rope: 0, end: 0 } })).toBeCloseTo((7 * TAU) / 8);
    d.ends[0]!.angle = (350 / 360) * TAU;
    d.ends[1]!.angle = (10 / 360) * TAU;
    expect(gapMidpoint(d, { after: { rope: 0, end: 0 }, before: { rope: 0, end: 1 } })).toBeCloseTo(0);
  });

  it("finds the gap containing an angle, excluding a moving end", () => {
    const d = createDiagram(2);
    const g = gapContaining(d, (3 * TAU) / 8);
    expect(g).toEqual({ after: { rope: 0, end: 1 }, before: { rope: 1, end: 0 } });
    const g2 = gapContaining(d, (3 * TAU) / 8, { rope: 0, end: 1 });
    expect(g2).toEqual({ after: { rope: 0, end: 0 }, before: { rope: 1, end: 0 } });
    const g3 = gapContaining(d, (15 * TAU) / 16);
    expect(g3).toEqual({ after: { rope: 1, end: 1 }, before: { rope: 0, end: 0 } });
  });

  it("gapOf returns the gap an end sits in", () => {
    const d = createDiagram(2);
    expect(gapOf(d, { rope: 1, end: 0 })).toEqual({ after: { rope: 0, end: 1 }, before: { rope: 1, end: 1 } });
  });
});
