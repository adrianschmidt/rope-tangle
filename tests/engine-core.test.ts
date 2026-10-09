import { rimBoard, type Board } from "../src/board";
import { D, H0 } from "../src/engine/constants";
import { Engine } from "../src/engine/engine";
import { settle } from "../src/engine/settle";
import type { P3 } from "../src/engine/types";

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

describe("engine core", () => {
  it("keeps a straight rope straight and still", () => {
    const board = rimBoard(4, 5), E = new Engine(board);
    const r = E.straightRope(holeAt(board, 0, 64), holeAt(board, 192, 192));
    settle(E);
    for (const p of r.pts) {
      const dist = Math.abs(128 * (p.x - 0) - 192 * (p.y - 64)) / Math.hypot(192, 128);
      expect(dist).toBeLessThan(0.01);
      expect(Math.abs(p.z)).toBeLessThan(0.01);
    }
  });

  it("pushes two crossing ropes apart to the contact distance with the higher one on top", () => {
    const E = crossingPair(4);
    settle(E);
    const list = [...E.signature().values()].flat();
    expect(list).toHaveLength(1);
    expect(list[0]!.over).toBe(0);
    expect(list[0]!.dz).toBeGreaterThan(D - 2);
    expect(E.lastMinD).toBeGreaterThan(D - 2);
  });

  it("does not push at all with contact distance zero", () => {
    const E = crossingPair(0);
    E.contactD = 0;
    for (let i = 0; i < 50; i++) E.substep(null);
    for (const r of E.ropes) for (const p of r.pts) expect(Math.abs(p.z)).toBeLessThan(1e-9);
  });

  it("orders a pair's crossings along the lower-numbered rope", () => {
    const board = rimBoard(4, 5), E = new Engine(board);
    E.addRope([{ x: 0, y: 128, z: 0 }, { x: 192, y: 128, z: 0 }], [holeAt(board, 0, 128), holeAt(board, 192, 128)]);
    E.addRope([{ x: 64, y: 0, z: 0 }, { x: 96, y: 200, z: 0 }, { x: 128, y: 0, z: 0 }], [holeAt(board, 64, 0), holeAt(board, 128, 0)]);
    const list = E.signature().get(1) ?? [];
    expect(list.map((c) => Math.round(c.x))).toEqual([84, 108]);
    expect(list[0]!.ua).toBeLessThan(list[1]!.ua);
  });

  it("leaves particles in place with tension off and nothing pushing", () => {
    const E = crossingPair(4);
    E.tensionOn = false;
    E.contactD = 0;
    const before = E.ropes.map((r) => r.pts.map((p) => [p.x, p.y, p.z]));
    for (let i = 0; i < 30; i++) E.substep(null);
    expect(E.ropes.map((r) => r.pts.map((p) => [p.x, p.y, p.z]))).toEqual(before);
  });

  it("keeps particle spacing near H0 by resampling", () => {
    const board = rimBoard(4, 5), E = new Engine(board);
    const pts: P3[] = [];
    for (let i = 0; i <= 64; i++) pts.push({ x: 3 * i, y: 64, z: 0 });
    const r = E.addRope(pts, [holeAt(board, 0, 64), holeAt(board, 192, 64)]);
    E.substep(null);
    expect(r.pts).toHaveLength(Math.round(192 / H0) + 1);
    expect(r.h).toBeGreaterThan(0.8 * H0);
    expect(r.h).toBeLessThan(1.25 * H0);
  });

  it("leaves spacing alone when resampling is off", () => {
    const board = rimBoard(4, 5), E = new Engine(board);
    E.resampleOn = false;
    const pts: P3[] = [];
    for (let i = 0; i <= 64; i++) pts.push({ x: 3 * i, y: 64, z: 0 });
    const r = E.addRope(pts, [holeAt(board, 0, 64), holeAt(board, 192, 64)]);
    E.substep(null);
    expect(r.pts).toHaveLength(65);
  });

  it("is deterministic", () => {
    const run = () => {
      const E = crossingPair(4);
      for (let i = 0; i < 100; i++) E.substep(null);
      return E.ropes.map((r) => r.pts.map((p) => [p.x, p.y, p.z]));
    };
    expect(run()).toEqual(run());
  });
});
