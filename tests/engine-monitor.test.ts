import { boardForRopes, rimBoard, type Board } from "../src/board";
import { Engine } from "../src/engine/engine";
import { legalEdit, Monitor } from "../src/engine/monitor";
import { scriptedMove } from "../src/engine/script";
import { settle } from "../src/engine/settle";
import type { P3, PhysCrossing } from "../src/engine/types";
import { mulberry32 } from "../src/util/rng";

const c = (over: number): PhysCrossing => ({ a: 0, b: 1, over, sign: 1, dz: 0, x: 0, y: 0, ua: 0, ub: 0 });

function holeAt(board: Board, x: number, y: number): number {
  const i = board.holes.findIndex((h) => h.x === x && h.y === y);
  if (i < 0) throw new Error(`no hole at ${x},${y}`);
  return i;
}

function bump(board: Board, i: number, j: number, peak: number): P3[] {
  const A = board.holes[i]!, B = board.holes[j]!, n = 40, pts: P3[] = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    pts.push({ x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t, z: peak * Math.sin(Math.PI * t) });
  }
  return pts;
}

function crossingPair(peak: number): Engine {
  const board = rimBoard(4, 5), E = new Engine(board);
  const a0 = holeAt(board, 0, 0), a1 = holeAt(board, 192, 256), b0 = holeAt(board, 192, 0), b1 = holeAt(board, 0, 256);
  E.addRope(bump(board, a0, a1, peak), [a0, a1]);
  E.addRope(bump(board, b0, b1, -peak), [b0, b1]);
  return E;
}

function straightBoard(n: number, seed: number): { E: Engine; rng: () => number } {
  const board = boardForRopes(n), rng = mulberry32(seed), m = board.holes.length;
  const idx = [...Array(m).keys()];
  for (let i = m - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [idx[i], idx[j]] = [idx[j]!, idx[i]!];
  }
  const chosen = idx.slice(0, 2 * n).sort((a, b) => a - b);
  const E = new Engine(board);
  for (let i = 0; i < n; i++) E.straightRope(chosen[2 * i]!, chosen[2 * i + 1]!);
  settle(E);
  return { E, rng };
}

describe("legalEdit", () => {
  it("allows identical sequences and the removal of adjacent equal pairs", () => {
    expect(legalEdit([c(0), c(1)], [c(0), c(1)], new Set())).toBe(true);
    expect(legalEdit([c(0), c(0), c(1)], [c(1)], new Set())).toBe(true);
  });

  it("rejects a flipped crossing unless its ropes are free", () => {
    expect(legalEdit([c(0)], [c(1)], new Set())).toBe(false);
    expect(legalEdit([c(0)], [c(1)], new Set([0, 1]))).toBe(true);
  });
});

describe("pass-through monitor", () => {
  it("flags a rope forced through another", () => {
    const E = crossingPair(4);
    settle(E);
    const m = new Monitor();
    E.monitor = m;
    E.substep(null);
    for (const p of E.ropes[1]!.pts.slice(1, -1)) {
      p.z += 40;
      p.pz = p.z;
    }
    E.substep(null);
    expect(m.kinds.flip).toBeGreaterThan(0);
  });

  it("compares the first substep against the state when the monitor was attached", () => {
    const E = crossingPair(4);
    settle(E);
    const m = new Monitor();
    E.attachMonitor(m);
    for (const p of E.ropes[1]!.pts.slice(1, -1)) {
      p.z += 40;
      p.pz = p.z;
    }
    E.substep(null);
    expect(m.kinds.flip).toBeGreaterThan(0);
  });

  it("plays scripted moves on 5-rope boards without a pass-through", () => {
    for (const seed of [1, 2, 3]) {
      const { E, rng } = straightBoard(5, seed);
      const m = new Monitor();
      E.monitor = m;
      for (let k = 0; k < 8; k++) {
        const rope = Math.floor(rng() * 5), end = rng() < 0.5 ? 0 : 1;
        const occ = E.occupied();
        const free = E.board.holes.map((_, i) => i).filter((i) => !occ.has(i));
        scriptedMove(E, rope, end, free[Math.floor(rng() * free.length)]!);
      }
      expect(m.count).toBe(0);
      expect(E.minDist).toBeGreaterThan(10);
      expect(E.ropes.every((r) => r.pts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.z)))).toBe(true);
    }
  }, 120_000);
});
