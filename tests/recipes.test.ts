import { createDiagram, endPos, moveEnd } from "../src/diagram";
import { alternate, checkConsistent, hookedRopes, isHooked, pairSequence } from "../src/diagram/queries";
import { TAU } from "../src/diagram/geometry";
import { cross } from "../src/recipes/cross";
import { flipGap } from "../src/recipes/flip";
import { hook } from "../src/recipes/hook";

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

describe("hook", () => {
  it("matches when the nearest crossing from the running end is under, and hooks", () => {
    const d = createDiagram(3);
    cross.apply(d, 0, 1, 1);                      // A over B
    expect(hook.match(d, 0, 1, 1)).toBe(false);   // A is over, not under
    expect(hook.match(d, 1, 0, 0)).toBe(true);
    expect(hook.match(d, 1, 0, 1)).toBe(true);
    const moves = hook.apply(d, 1, 0, 0);
    expect(moves).toHaveLength(1);
    expect(pairSequence(d, 1, 0)).toEqual(["over", "under"]);
    expect(pairSequence(d, 1, 0, 1)).toEqual(["under", "over"]);
    expect(isHooked(d, 0, 1)).toBe(true);
    expect(hookedRopes(d)).toEqual(new Set([0, 1]));
    checkConsistent(d);
  });

  it("does not match when the nearest crossing is over even if an under lies behind it", () => {
    const d = createDiagram(3);
    cross.apply(d, 0, 1, 1);
    hook.apply(d, 1, 0, 0);
    expect(hook.match(d, 1, 0, 0)).toBe(false);
    expect(hook.match(d, 1, 0, 1)).toBe(true);
  });
});
