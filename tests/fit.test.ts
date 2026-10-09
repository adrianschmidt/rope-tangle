import { boardForRopes, rimBoard } from "../src/board";
import { createDiagram, cyclicOrder, moveEnd, TAU, type Diagram, type EndRef } from "../src/diagram";
import { POST_R } from "../src/engine/constants";
import { assignHoles, buildLayout, embedding, extensionPoint, pegs } from "../src/realize/fit";
import { pegClearance, validLayout } from "../src/realize/layout";
import { scramble } from "../src/scramble/scramble";
import { mulberry32 } from "../src/util/rng";

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

function packedEndsDiagram(): Diagram {
  const d = createDiagram(10);
  const x: EndRef = { rope: 0, end: 0 };
  let before: EndRef = { rope: 0, end: 1 };
  for (let rope = 1; rope < 10; rope++) {
    for (const end of [0, 1] as const) {
      moveEnd(d, rope, end, { after: x, before });
      before = { rope, end };
    }
  }
  return d;
}

function crossingLabels(d: Diagram, rope: number): boolean[] {
  return d.ropes[rope]!.vertices.filter((v) => v.kind === "crossing").map((v) => v.overHere === true);
}

describe("assignHoles", () => {
  it("uses distinct holes in the same cyclic order as the ends", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const n = 4 + (seed % 7);
      const { diagram } = scramble(seed, n);
      const board = boardForRopes(n);
      const holes = assignHoles(diagram, board, mulberry32(seed));
      expect(new Set(holes).size).toBe(2 * n);
      const rims = cyclicOrder(diagram).map((e) => board.holes[holes[e.rope * 2 + e.end]!]!.rim);
      let descents = 0;
      for (let i = 0; i < rims.length; i++) if (rims[(i + 1) % rims.length]! < rims[i]!) descents++;
      expect(descents).toBe(1);
    }
  });
});

describe("embedding", () => {
  it("starts each extension where the rope meets the disc and ends it on the hole's radial, clear of the pegs", () => {
    const { diagram } = scramble(3, 6);
    const board = boardForRopes(6);
    const holes = assignHoles(diagram, board, mulberry32(3));
    const emb = embedding(diagram, board, holes);
    diagram.ends.forEach((e, key) => {
      const h = board.holes[holes[key]!]!;
      const end = extensionPoint(board, emb, key, 1);
      const ux = h.x - emb.center.x, uy = h.y - emb.center.y, vx = end.x - emb.center.x, vy = end.y - emb.center.y;
      expect(Math.abs(ux * vy - uy * vx) / Math.hypot(ux, uy)).toBeLessThan(1e-6);
      expect(Math.hypot(end.x - h.x, end.y - h.y)).toBeGreaterThan(POST_R);
      for (const other of board.holes) expect(Math.hypot(end.x - other.x, end.y - other.y)).toBeGreaterThan(POST_R);
      const start = extensionPoint(board, emb, key, 0);
      expect(start.x).toBeCloseTo(emb.center.x + emb.radius * Math.cos(e.angle), 9);
      expect(start.y).toBeCloseTo(emb.center.y + emb.radius * Math.sin(e.angle), 9);
      for (let j = 1; j < 20; j++) {
        const p = extensionPoint(board, emb, key, j / 20);
        expect(Math.hypot(p.x - emb.center.x, p.y - emb.center.y)).toBeGreaterThan(emb.radius);
      }
    });
  });

  it("unwraps hole angles to increase like the end angles within one turn", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const n = 4 + (seed % 7);
      const { diagram } = scramble(seed, n);
      const board = boardForRopes(n);
      const emb = embedding(diagram, board, assignHoles(diagram, board, mulberry32(seed)));
      const phi = cyclicOrder(diagram).map((e) => emb.ends[e.rope * 2 + e.end]!.phi);
      for (let i = 1; i < phi.length; i++) expect(phi[i]!).toBeGreaterThan(phi[i - 1]!);
      expect(phi[phi.length - 1]! - phi[0]!).toBeLessThan(TAU);
    }
  });
});

describe("buildLayout", () => {
  it("builds a valid layout with one shared node per crossing and fixed ends at holes", () => {
    for (let seed = 1; seed <= 15; seed++) {
      const n = 4 + (seed % 7);
      const { diagram } = scramble(seed, n);
      const board = boardForRopes(n);
      const holes = assignHoles(diagram, board, mulberry32(seed));
      const L = buildLayout(diagram, board, holes);
      expect(validLayout(L)).toBe(true);
      const crossingNodes = new Set<number>();
      L.ropes.forEach((r) => r.labels.forEach((lab, k) => {
        if (lab !== null) crossingNodes.add(r.nodes[k]!);
      }));
      expect(crossingNodes.size).toBe(diagram.crossings.size);
      expect(pegClearance(L, pegs(board, holes))).toBeGreaterThan(POST_R);
      L.ropes.forEach((r, i) => {
        const first = L.nodes[r.nodes[0]!]!, last = L.nodes[r.nodes[r.nodes.length - 1]!]!;
        expect(first.fixed && last.fixed).toBe(true);
        expect(first).toMatchObject({ x: board.holes[holes[i * 2]!]!.x, y: board.holes[holes[i * 2]!]!.y });
        expect(last).toMatchObject({ x: board.holes[holes[i * 2 + 1]!]!.x, y: board.holes[holes[i * 2 + 1]!]!.y });
      });
    }
  });

  it("keeps every rope's crossing labels in diagram order", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { diagram } = scramble(seed, 6);
      const board = boardForRopes(6);
      const L = buildLayout(diagram, board, assignHoles(diagram, board, mulberry32(seed)));
      L.ropes.forEach((r, i) => expect(r.labels.filter((l) => l !== null)).toEqual(crossingLabels(diagram, i)));
    }
  });

  it("copes with ends packed within a few millionths of a radian", () => {
    const d = packedEndsDiagram();
    const o = cyclicOrder(d);
    let gap = Infinity;
    for (let i = 0; i + 1 < o.length; i++) gap = Math.min(gap, o[i + 1]!.angle - o[i]!.angle);
    expect(gap).toBeLessThan(1e-5);
    const board = boardForRopes(10);
    const L = buildLayout(d, board, assignHoles(d, board, mulberry32(1)));
    expect(validLayout(L)).toBe(true);
  });

  it("copes with a rope that crosses itself", () => {
    const d = selfCrossingDiagram();
    expect([...d.crossings.values()].some((c) => c.a === c.b)).toBe(true);
    const board = rimBoard(4, 5);
    const L = buildLayout(d, board, assignHoles(d, board, mulberry32(2)));
    expect(validLayout(L)).toBe(true);
    L.ropes.forEach((r, i) => expect(r.labels.filter((l) => l !== null)).toEqual(crossingLabels(d, i)));
  });
});
