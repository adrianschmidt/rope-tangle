import { boardForRopes, rimBoard } from "../src/board";
import { createDiagram, cyclicOrder, moveEnd, type Diagram, type EndRef } from "../src/diagram";
import { POST_R } from "../src/engine/constants";
import { assignHoles, buildLayout, pegs } from "../src/realize/fit";
import { pegClearance, validLayout, type Layout } from "../src/realize/layout";
import { relax, RELAX_ITERATIONS } from "../src/realize/relax";
import { scramble } from "../src/scramble/scramble";
import { mulberry32 } from "../src/util/rng";

function medianNearestCrossing(L: Layout): number {
  const ids = new Set<number>();
  L.ropes.forEach((r) => r.labels.forEach((l, k) => {
    if (l !== null) ids.add(r.nodes[k]!);
  }));
  const pts = [...ids].map((i) => L.nodes[i]!);
  const near = pts.map((p, i) => Math.min(...pts.filter((_, j) => j !== i).map((q) => Math.hypot(p.x - q.x, p.y - q.y))));
  near.sort((a, b) => a - b);
  return near[Math.floor(near.length / 2)]!;
}

function scrambledLayout(seed: number, n: number): Layout {
  const { diagram } = scramble(seed, n);
  const board = boardForRopes(n);
  return buildLayout(diagram, board, assignHoles(diagram, board, mulberry32(seed)));
}

function selfCrossingDiagram(): Diagram {
  const rng = mulberry32(768);
  const d = createDiagram(3);
  for (let step = 0; step < 18; step++) {
    const ref: EndRef = { rope: Math.floor(rng() * 3), end: rng() < 0.5 ? 0 : 1 };
    const order = cyclicOrder(d, ref);
    const i = Math.floor(rng() * order.length);
    moveEnd(d, ref.rope, ref.end, { after: order[i]!, before: order[(i + 1) % order.length]! });
  }
  return d;
}

describe("relax", () => {
  it("keeps scrambled layouts valid and spreads their crossings apart", () => {
    for (let seed = 1; seed <= 5; seed++) {
      const L = scrambledLayout(seed, 8);
      const before = medianNearestCrossing(L);
      relax(L, RELAX_ITERATIONS);
      expect(validLayout(L)).toBe(true);
      expect(medianNearestCrossing(L)).toBeGreaterThan(before);
    }
  }, 60_000);

  it("keeps every edge out of other ropes' peg discs", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const n = 4 + (seed % 7);
      const { diagram } = scramble(seed, n);
      const board = boardForRopes(n);
      const holes = assignHoles(diagram, board, mulberry32(seed));
      const L = buildLayout(diagram, board, holes), P = pegs(board, holes);
      relax(L, RELAX_ITERATIONS, P);
      expect([seed, pegClearance(L, P) > POST_R]).toEqual([seed, true]);
      expect(validLayout(L)).toBe(true);
    }
  }, 60_000);

  it("never moves fixed nodes", () => {
    const L = scrambledLayout(2, 6);
    const fixed = L.nodes.filter((n) => n.fixed).map((n) => [n.x, n.y]);
    relax(L, 20);
    expect(L.nodes.filter((n) => n.fixed).map((n) => [n.x, n.y])).toEqual(fixed);
  });

  it("will not pull a rope through another to reach its target", () => {
    const L: Layout = {
      nodes: [
        { x: -60, y: -10, fixed: true },
        { x: -55, y: 5, fixed: false },
        { x: 0, y: 5, fixed: false },
        { x: 55, y: 5, fixed: false },
        { x: 60, y: -10, fixed: true },
        { x: -50, y: 0, fixed: true },
        { x: 50, y: 0, fixed: true },
      ],
      ropes: [
        { nodes: [0, 1, 2, 3, 4], labels: [null, null, null, null, null] },
        { nodes: [5, 6], labels: [null, null] },
      ],
    };
    expect(validLayout(L)).toBe(true);
    relax(L, RELAX_ITERATIONS);
    expect(validLayout(L)).toBe(true);
    expect(L.nodes[2]!.y).toBeGreaterThan(0);
  });

  it("keeps a self-crossing layout valid", () => {
    const d = selfCrossingDiagram();
    const board = rimBoard(4, 5);
    const L = buildLayout(d, board, assignHoles(d, board, mulberry32(2)));
    relax(L, RELAX_ITERATIONS);
    expect(validLayout(L)).toBe(true);
  });

  it("is deterministic", () => {
    const a = scrambledLayout(4, 6), b = scrambledLayout(4, 6);
    relax(a, 30);
    relax(b, 30);
    expect(a.nodes).toEqual(b.nodes);
  });
});
