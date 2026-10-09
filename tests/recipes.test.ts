import { createDiagram, endPos, moveEnd } from "../src/diagram";
import { alternate, checkConsistent, pairSequence } from "../src/diagram/queries";
import { TAU } from "../src/diagram/geometry";
import { cross } from "../src/recipes/cross";
import { flipGap } from "../src/recipes/flip";

const deg = (x: number) => (x / 360) * TAU;

describe("flipGap", () => {
  it("targets the arc of the partner that does not contain the moving end", () => {
    const d = createDiagram(2);
    expect(flipGap(d, { rope: 0, end: 1 }, 1)).toEqual({ after: { rope: 1, end: 0 }, before: { rope: 1, end: 1 } });
    moveEnd(d, 0, 1, flipGap(d, { rope: 0, end: 1 }, 1));
    expect(alternate(d, 0, 1)).toBe(true);
    moveEnd(d, 0, 1, flipGap(d, { rope: 0, end: 1 }, 1));
    expect(alternate(d, 0, 1)).toBe(false);
  });
});

describe("cross", () => {
  it("matches only pairs with no crossings and produces one over-crossing", () => {
    const d = createDiagram(3);
    expect(cross.match(d, 0, 1, 1)).toBe(true);
    const moves = cross.apply(d, 0, 1, 1);
    expect(moves).toHaveLength(1);
    expect(moves[0]!.rope).toBe(0);
    expect(pairSequence(d, 0, 1)).toEqual(["over"]);
    expect(cross.match(d, 0, 1, 1)).toBe(false);
    expect(cross.match(d, 1, 0, 0)).toBe(false);
    expect(cross.match(d, 0, 2, 0)).toBe(true);
    checkConsistent(d);
    expect(endPos(d, { rope: 0, end: 1 }).angle).toBeCloseTo(deg(150));
  });
});
