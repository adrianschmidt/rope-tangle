import { createDiagram, reduce, type Diagram, type Vertex } from "../src/diagram";
import { alternate, checkConsistent, crossingCount, hookedRopes, isHooked, linking, pairSequence } from "../src/diagram/queries";
import { cross, hook } from "../src/recipes";
import { scrambleWithRetry } from "../src/scramble/scramble";

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

  it("checkConsistent catches an over record that disagrees with overHere", () => {
    const d = createDiagram(2);
    const id = d.nextCrossingId++;
    d.crossings.set(id, { id, a: 0, b: 1, over: 0 });
    d.ropes[0]!.vertices.splice(1, 0, { x: 0, y: 0, kind: "crossing", crossingId: id, overHere: false });
    d.ropes[1]!.vertices.splice(1, 0, { x: 0, y: 0, kind: "crossing", crossingId: id, overHere: true });
    expect(() => checkConsistent(d)).toThrow();
  });
});

describe("linking", () => {
  it("counts a plain crossing once and a hook twice, with the sign of the mirror image negated", () => {
    const d = createDiagram(4);
    cross.apply(d, 0, 1, 1);
    expect(Math.abs(linking(d, 0, 1))).toBe(1);
    hook.apply(d, 1, 0, 0);
    const lk = linking(d, 0, 1);
    expect(Math.abs(lk)).toBe(2);
    expect(linking(d, 1, 0)).toBe(lk);
    for (const c of d.crossings.values()) c.over = c.over === c.a ? c.b : c.a;
    for (const r of d.ropes) for (const v of r.vertices) if (v.kind === "crossing") v.overHere = !v.overHere;
    expect(linking(d, 0, 1)).toBe(-lk);
  });

  it("is unchanged by removing bigons", () => {
    for (const seed of [1000, 2000, 3000]) {
      const d = scrambleWithRetry(seed, 6).diagram, r = reduce(d);
      for (let a = 0; a < 6; a++) for (let b = a + 1; b < 6; b++) expect(linking(r, a, b)).toBe(linking(d, a, b));
    }
  });
});
