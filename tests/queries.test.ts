import { createDiagram, type Diagram, type Vertex } from "../src/diagram";
import { alternate, checkConsistent, crossingCount, hookedRopes, isHooked, pairSequence } from "../src/diagram/queries";

function addCrossing(d: Diagram, a: number, posA: number, b: number, posB: number, over: number): void {
  const id = d.nextCrossingId++;
  d.crossings.set(id, { id, a, b, over });
  const va: Vertex = { x: 0, y: 0, kind: "crossing", crossingId: id, overHere: over === a };
  const vb: Vertex = { x: 0, y: 0, kind: "crossing", crossingId: id, overHere: over === b && a !== b };
  d.ropes[a]!.vertices.splice(posA, 0, va);
  d.ropes[b]!.vertices.splice(posB, 0, vb);
}

describe("pairSequence and hooks", () => {
  it("reads labels along a rope from either end", () => {
    const d = createDiagram(2);
    addCrossing(d, 0, 1, 1, 1, 1);
    addCrossing(d, 0, 2, 1, 1, 0);
    expect(pairSequence(d, 0, 1)).toEqual(["under", "over"]);
    expect(pairSequence(d, 0, 1, 1)).toEqual(["over", "under"]);
    expect(pairSequence(d, 1, 0)).toEqual(["under", "over"]);
    expect(isHooked(d, 0, 1)).toBe(true);
    expect(hookedRopes(d)).toEqual(new Set([0, 1]));
    expect(crossingCount(d, 0)).toBe(2);
    checkConsistent(d);
  });

  it("is not hooked with a single label and ignores self-crossings for counts", () => {
    const d = createDiagram(2);
    addCrossing(d, 0, 1, 1, 1, 0);
    expect(pairSequence(d, 0, 1)).toEqual(["over"]);
    expect(isHooked(d, 0, 1)).toBe(false);
    expect(hookedRopes(d).size).toBe(0);
    const id = d.nextCrossingId++;
    d.crossings.set(id, { id, a: 0, b: 0, over: 0 });
    d.ropes[0]!.vertices.splice(1, 0, { x: 0, y: 0, kind: "crossing", crossingId: id, overHere: true });
    d.ropes[0]!.vertices.splice(3, 0, { x: 0, y: 0, kind: "crossing", crossingId: id, overHere: false });
    expect(crossingCount(d, 0)).toBe(1);
    expect(pairSequence(d, 0, 0)).toEqual(["over", "under"]);
    expect(isHooked(d, 0, 0)).toBe(false);
    checkConsistent(d);
  });

  it("alternate reflects the cyclic order of ends", () => {
    const d = createDiagram(2);
    expect(alternate(d, 0, 1)).toBe(false);
    d.ends[1]!.angle = d.ends[2]!.angle + 0.1;
    expect(alternate(d, 0, 1)).toBe(true);
  });

  it("checkConsistent catches a dangling crossing", () => {
    const d = createDiagram(2);
    addCrossing(d, 0, 1, 1, 1, 0);
    d.ropes[1]!.vertices.splice(1, 1);
    expect(() => checkConsistent(d)).toThrow();
  });
});
