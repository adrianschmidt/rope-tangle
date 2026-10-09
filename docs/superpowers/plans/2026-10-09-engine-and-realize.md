# Engine and Realize Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn a scrambled diagram into a settled physical board that agrees with it, show it on the dev page, and measure how often the two agree.

**Architecture:** Three new modules and one composition module. `board` is the hole layout as data. `engine` is a typed port of the second prototype's physics (`spike/index.html`). `realize` places the diagram unchanged as a disc in the middle of the board, extends each rope from the disc's edge to its hole without crossing anything, spreads the result out without changing its topology, places it as ropes of zero thickness, inflates them, and compares the result with the diagram. `generate` runs scramble and realize with a retry on disagreement and writes debug dumps. A small `render` port draws the result on the dev page; input, the game loop and the worker are plan 3.

**Tech Stack:** TypeScript (strict), Vite, Vitest, oxlint. No runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-10-08-rope-tangle-design.md` (§4, §5, §8, §9, §11). §9.1 and §9.2 were revised with this plan: the fold trick is replaced by extensions from a central disc to the holes, and a topology-preserving spreading pass is added, because measured scrambles pack crossings far below rope width (median 0.002 of the radius between neighboring crossings at 10 ropes, minimum 1e-5).

## Global Constraints

- Toolchain and lint exactly as plan 1: TypeScript ~7.0.2 with `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `erasableSyntaxOnly`; oxlint with `no-console`, `no-explicit-any`, `only-throw-error`, `no-unsafe-type-assertion`. Use `!` for indexed access you know is in range; never `as` casts except `as const`.
- Module dependencies (spec §4): `board` imports nothing from the game; `engine` imports only `board` and `util`; `realize` imports `diagram`, `engine`, `board`, `util`; `generate` imports `scramble`, `realize`, `recipes`, `engine`, `board`. The engine must never import `diagram`.
- Engine constants are the spec's, verbatim: `H0 = 8`, `OMEGA = 0.5`, `D = 16`, `SELF_GAP = 4`, `ITER = 8`, `DAMP = 0.9`, `VCUT = 0.3`, `VMAX = 2.5`, `DMAX = 4`, `STEP = 3`, `LIFT = 45`, `CLEARANCE = 38`, `POST_R = 25`, `POST_H = 38`, inflation ramp 150 substeps, settle threshold 0.15 over an 8-substep window or 800 substeps.
- Determinism: no `Math.random` in `board`, `engine`, `realize` or `generate`. All randomness comes from `mulberry32` seeded from the board seed.
- Code comments carry a high cost in this project: add none unless one is clearly worth its upkeep.
- American spelling in all identifiers.
- In worktree sessions bare `npm` may be refused; call the resolved npm binary (`/opt/homebrew/bin/npm` on the Mac mini).

## Review Focus

1. **Ends packed within a few millionths of a radian.** Their extensions start almost on top of each other and fan out; the sampled layout must still validate. Pinned by the "packed ends" test in Task 5.
2. **A rope that crosses itself.** Its crossing node has two passes of the same rope; the rotation check and the spreading pass must handle that. Pinned by the self-crossing tests in Tasks 5 and 6.
3. **A disagreement in the middle of generation.** `generateBoard` must keep a dump, move to the next seed and still return a board; it must throw only after `maxTries`. Pinned by Task 8's tests.
4. **A rope lying over an occupied hole.** The peg must push it to the board side. Pinned by Task 3's peg test.
5. **Inflation on real scrambles.** The pass-through monitor should stay silent while ropes inflate. Not assertable before measuring; Task 10 measures flags per board and reports them.

---

### Task 1: Board

**Files:**
- Create: `src/util/point.ts`, `src/board/board.ts`, `src/board/index.ts`
- Modify: `src/diagram/geometry.ts:1-4` (take `Point` from `util`)
- Test: `tests/board.test.ts`

**Interfaces:**
- Produces:
```ts
export interface Point { x: number; y: number }                       // src/util/point.ts
export interface Hole { x: number; y: number; rim: number; ox: number; oy: number }
export interface Board { width: number; height: number; holes: Hole[]; rimLength: number }
export const PITCH = 64;
export function rimBoard(cols: number, rows: number): Board;
export function boardForRopes(ropes: number): Board;                   // 4..10, throws otherwise
export function rimParam(board: { width: number; height: number }, p: Point): number;
export function rimPoint(board: Board, t: number): Point;
```
- Holes run clockwise on screen (y down) from the top-left corner: top edge left to right, right edge downward, bottom edge right to left, left edge upward. `rim` is the distance along that path; `ox, oy` the outward unit normal, diagonal at corners.

- [ ] **Step 1: Write the failing test**

`tests/board.test.ts`:
```ts
import { boardForRopes, PITCH, rimBoard, rimPoint } from "../src/board";

describe("rim board", () => {
  it("puts holes on the perimeter in clockwise order from the top-left corner", () => {
    const b = rimBoard(4, 5);
    expect(b.width).toBe(3 * PITCH);
    expect(b.height).toBe(4 * PITCH);
    expect(b.holes).toHaveLength(14);
    expect(b.holes[0]).toMatchObject({ x: 0, y: 0, rim: 0 });
    expect(b.holes[3]).toMatchObject({ x: 192, y: 0, rim: 192 });
    expect(b.holes[4]).toMatchObject({ x: 192, y: 64, rim: 256 });
    expect(b.holes[13]).toMatchObject({ x: 0, y: 64, rim: 832 });
    for (let i = 1; i < b.holes.length; i++) expect(b.holes[i]!.rim).toBeGreaterThan(b.holes[i - 1]!.rim);
    expect(b.rimLength).toBe(2 * (192 + 256));
  });

  it("has outward normals, diagonal at corners", () => {
    const b = rimBoard(4, 5);
    expect(b.holes[0]!.ox).toBeCloseTo(-Math.SQRT1_2);
    expect(b.holes[0]!.oy).toBeCloseTo(-Math.SQRT1_2);
    expect(b.holes[1]).toMatchObject({ ox: 0, oy: -1 });
    expect(b.holes[4]).toMatchObject({ ox: 1, oy: 0 });
  });

  it("maps rim parameters back to hole positions", () => {
    const b = rimBoard(5, 6);
    for (const h of b.holes) {
      const p = rimPoint(b, h.rim);
      expect(p.x).toBeCloseTo(h.x);
      expect(p.y).toBeCloseTo(h.y);
    }
    expect(rimPoint(b, b.rimLength + 10)).toEqual(rimPoint(b, 10));
    expect(rimPoint(b, -10)).toEqual(rimPoint(b, b.rimLength - 10));
  });

  it("sizes boards by rope count with room to spare", () => {
    for (let n = 4; n <= 10; n++) expect(boardForRopes(n).holes.length).toBeGreaterThanOrEqual(2 * n + 4);
    expect(boardForRopes(10).width).toBe(6 * PITCH);
    expect(() => boardForRopes(3)).toThrow();
    expect(() => boardForRopes(11)).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- tests/board.test.ts`
Expected: FAIL, module `../src/board` not found.

- [ ] **Step 3: Implement**

`src/util/point.ts`:
```ts
export interface Point {
  x: number;
  y: number;
}
```

In `src/diagram/geometry.ts`, replace the `Point` interface (lines 1–4) with:
```ts
import type { Point } from "../util/point";

export type { Point };
```

`src/board/board.ts`:
```ts
import type { Point } from "../util/point";

export interface Hole {
  x: number;
  y: number;
  rim: number;
  ox: number;
  oy: number;
}

export interface Board {
  width: number;
  height: number;
  holes: Hole[];
  rimLength: number;
}

export const PITCH = 64;

const SIZES = new Map<number, [number, number]>([
  [4, [4, 5]],
  [5, [4, 6]],
  [6, [5, 6]],
  [7, [5, 7]],
  [8, [6, 7]],
  [9, [6, 8]],
  [10, [7, 8]],
]);

export function rimParam(board: { width: number; height: number }, p: Point): number {
  const w = board.width, h = board.height;
  if (p.y <= 0) return Math.min(Math.max(p.x, 0), w);
  if (p.x >= w) return w + Math.min(p.y, h);
  if (p.y >= h) return w + h + (w - Math.max(p.x, 0));
  return 2 * w + h + (h - p.y);
}

export function rimPoint(board: Board, t: number): Point {
  const w = board.width, h = board.height;
  let u = t % board.rimLength;
  if (u < 0) u += board.rimLength;
  if (u <= w) return { x: u, y: 0 };
  u -= w;
  if (u <= h) return { x: w, y: u };
  u -= h;
  if (u <= w) return { x: w - u, y: h };
  u -= w;
  return { x: 0, y: h - u };
}

export function rimBoard(cols: number, rows: number): Board {
  const width = (cols - 1) * PITCH, height = (rows - 1) * PITCH;
  const holes: Hole[] = [];
  const add = (x: number, y: number) => {
    const ox = x === 0 ? -1 : x === width ? 1 : 0;
    const oy = y === 0 ? -1 : y === height ? 1 : 0;
    const l = Math.hypot(ox, oy);
    holes.push({ x, y, rim: rimParam({ width, height }, { x, y }), ox: ox / l, oy: oy / l });
  };
  for (let i = 0; i < cols; i++) add(i * PITCH, 0);
  for (let j = 1; j < rows; j++) add(width, j * PITCH);
  for (let i = cols - 2; i >= 0; i--) add(i * PITCH, height);
  for (let j = rows - 2; j >= 1; j--) add(0, j * PITCH);
  return { width, height, holes, rimLength: 2 * (width + height) };
}

export function boardForRopes(ropes: number): Board {
  const size = SIZES.get(ropes);
  if (!size) throw new Error(`boardForRopes: no board for ${ropes} ropes`);
  return rimBoard(size[0], size[1]);
}
```

`src/board/index.ts`:
```ts
export * from "./board";
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- tests/board.test.ts`
Expected: PASS.

- [ ] **Step 5: Full suite, typecheck, lint, commit**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all green (the diagram tests still pass with the moved `Point`).

```bash
git add src/util/point.ts src/board src/diagram/geometry.ts tests/board.test.ts
git commit -m "feat: add the rim board layout"
```

---

### Task 2: Engine core

The physics port. This task writes the whole `Engine` class, including the end-handling and peg code that Task 3 tests, because `substep` drives all of it. Its own tests cover ropes, tension, contacts, resampling, determinism and the crossing readout.

**Files:**
- Create: `src/engine/constants.ts`, `src/engine/types.ts`, `src/engine/geom3.ts`, `src/engine/collider.ts`, `src/engine/posts.ts`, `src/engine/monitor.ts`, `src/engine/engine.ts`, `src/engine/settle.ts`, `src/engine/index.ts`
- Test: `tests/engine-core.test.ts`

**Interfaces:**
- Consumes: `Board`, `Hole` (Task 1), `Point` (Task 1).
- Produces:
```ts
export interface P3 { x: number; y: number; z: number }
export interface Particle extends P3 { px: number; py: number; pz: number; rx: number; ry: number; rz: number }
export interface ERope { id: number; pts: Particle[]; ends: [number | null, number | null]; cleared: boolean; s: Float64Array; L: number; h: number; maxSeg: number; zeroN: number }
export interface PhysCrossing { a: number; b: number; over: number; dz: number; x: number; y: number; ua: number; ub: number }
export type Signature = Map<number, PhysCrossing[]>;          // key pairKey(a, b); a < b; sorted by ua (arc length along a from its end 0)
export function pairKey(a: number, b: number): number;
export class Engine {
  constructor(board: Board);
  readonly board: Board; ropes: ERope[]; held; flying; landing;
  contactD: number;        // default D; realize ramps it from 0
  resampleOn: boolean;     // default true
  zTension: boolean;       // default true
  monitor: Monitor | null;
  drift: number; substeps: number; minDist: number; lastMinD: number; maxSpeed: number; lastHeld: number;
  readonly freeIds: Set<number>;
  hole(i: number): Hole; rope(id: number): ERope;
  addRope(points: readonly P3[], ends: [number, number]): ERope;  // points[0] sits at hole ends[0]
  straightRope(holeA: number, holeB: number): ERope;
  active(): ERope[]; endPoint(rope: number, end: 0 | 1): Particle; occupied(): Set<number>;
  grab(rope: number, end: 0 | 1): void; attach(hole: number): void; release(path: readonly Point[], hole: number): void;
  busy(): boolean; busyRopes(): Set<number>; resetDrift(): void;
  substep(target: Point | null): void;
  signature(): Signature; crossingCounts(): Map<number, number>; clearFree(minStreak: number): number[];
}
export function settle(E: Engine, max?: number, eps?: number): number;   // defaults 800, 0.15; returns substeps used
export class Monitor { count: number; kinds: { flip: number; illegal: number }; log: FlagRecord[]; observe(sig, free, lastHeld, step): void }
export function legalEdit(O: readonly PhysCrossing[], N: readonly PhysCrossing[], ids: ReadonlySet<number>): boolean;
export const ENGINE_CONSTANTS: Record<string, number>;
```

- [ ] **Step 1: Write the failing test**

`tests/engine-core.test.ts`:
```ts
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
```

`pairKey(0, 1)` is `1`, which is why the ordering test reads `signature().get(1)`.

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- tests/engine-core.test.ts`
Expected: FAIL, engine modules not found.

- [ ] **Step 3: Implement**

`src/engine/constants.ts`:
```ts
export const W = 12;
export const D = 16;
export const H0 = 8;
export const OMEGA = 0.5;
export const ITER = 8;
export const STEP = 3;
export const DMAX = 4;
export const VMAX = 2.5;
export const DAMP = 0.9;
export const VREST = 0.8;
export const VCUT = 0.3;
export const PEG_R = 17;
export const POST_R = 25;
export const POST_H = 38;
export const POST_REACH = 200;
export const LIFT = 45;
export const CLEARANCE = 38;
export const HOLD_RADIUS = 30;
export const LAND_WAIT = 40;
export const BLOCKER_H = 400;
export const CELL = 32;
export const SELF_GAP = 4;
export const WARM_EVERY = 2;
export const MARGIN = 3;

export const ENGINE_CONSTANTS: Record<string, number> = {
  W, D, H0, OMEGA, ITER, STEP, DMAX, VMAX, DAMP, VREST, VCUT, PEG_R, POST_R, POST_H, POST_REACH,
  LIFT, CLEARANCE, HOLD_RADIUS, LAND_WAIT, BLOCKER_H, CELL, SELF_GAP, WARM_EVERY, MARGIN,
};
```

`src/engine/types.ts`:
```ts
import type { Point } from "../util/point";

export interface P3 {
  x: number;
  y: number;
  z: number;
}

export interface Particle extends P3 {
  px: number;
  py: number;
  pz: number;
  rx: number;
  ry: number;
  rz: number;
}

export interface ERope {
  id: number;
  pts: Particle[];
  ends: [number | null, number | null];
  cleared: boolean;
  s: Float64Array;
  L: number;
  h: number;
  maxSeg: number;
  zeroN: number;
}

export interface HeldEnd {
  rope: number;
  end: 0 | 1;
  from: number;
  lifted: boolean;
}

export interface FlyingEnd extends HeldEnd {
  path: Point[];
  hole: number;
  top: P3;
}

export interface LandingEnd {
  p: Particle;
  hole: number;
  rope: number;
  wait: number;
  top: P3;
}

export interface PhysCrossing {
  a: number;
  b: number;
  over: number;
  dz: number;
  x: number;
  y: number;
  ua: number;
  ub: number;
}

export type Signature = Map<number, PhysCrossing[]>;

export function pairKey(a: number, b: number): number {
  return a < b ? a * 64 + b : b * 64 + a;
}

export function particle(x: number, y: number, z: number): Particle {
  return { x, y, z, px: x, py: y, pz: z, rx: Number.NaN, ry: Number.NaN, rz: Number.NaN };
}
```

`src/engine/geom3.ts`:
```ts
import type { Point } from "../util/point";
import type { P3 } from "./types";

export interface ClosestOut {
  s: number;
  t: number;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function closestSegSeg(p1: P3, q1: P3, p2: P3, q2: P3, out: ClosestOut): void {
  const d1x = q1.x - p1.x, d1y = q1.y - p1.y, d1z = q1.z - p1.z;
  const d2x = q2.x - p2.x, d2y = q2.y - p2.y, d2z = q2.z - p2.z;
  const rx = p1.x - p2.x, ry = p1.y - p2.y, rz = p1.z - p2.z;
  const a = d1x * d1x + d1y * d1y + d1z * d1z, e = d2x * d2x + d2y * d2y + d2z * d2z;
  const f = d2x * rx + d2y * ry + d2z * rz;
  let s: number, t: number;
  if (a <= 1e-12 && e <= 1e-12) {
    s = 0;
    t = 0;
  } else if (a <= 1e-12) {
    s = 0;
    t = clamp01(f / e);
  } else {
    const c = d1x * rx + d1y * ry + d1z * rz;
    if (e <= 1e-12) {
      t = 0;
      s = clamp01(-c / a);
    } else {
      const b = d1x * d2x + d1y * d2y + d1z * d2z, den = a * e - b * b;
      s = den > 1e-12 ? clamp01((b * f - c * e) / den) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp01((b - c) / a);
      }
    }
  }
  out.s = s;
  out.t = t;
}

export function segCross(p1: Point, p2: Point, p3: Point, p4: Point): [number, number] | null {
  const d1x = p2.x - p1.x, d1y = p2.y - p1.y, d2x = p4.x - p3.x, d2y = p4.y - p3.y;
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < 1e-12) return null;
  const ex = p3.x - p1.x, ey = p3.y - p1.y;
  const t = (ex * d2y - ey * d2x) / den;
  const u = (ex * d1y - ey * d1x) / den;
  if (t < 0 || t >= 1 || u < 0 || u >= 1) return null;
  return [t, u];
}
```

`src/engine/collider.ts`:
```ts
import { CELL, MARGIN, SELF_GAP } from "./constants";
import { closestSegSeg, type ClosestOut } from "./geom3";
import type { ERope, P3 } from "./types";

export interface Seg {
  rope: ERope;
  k: number;
  a: P3;
  b: P3;
  ima: number;
  imb: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
  cx: number;
  cy: number;
  cx1: number;
  cy1: number;
}

export class Collider {
  segs: Seg[] = [];
  n = 0;
  cand = new Int32Array(8192);
  candN = 0;
  private cellStart = new Int32Array(256);
  private cellFill = new Int32Array(256);
  private items = new Int32Array(4096);
  private hot = new Int32Array(4096);
  private hotN = 0;
  private warm = new Int32Array(4096);
  private warmN = 0;
  private readonly cp: ClosestOut = { s: 0, t: 0 };

  begin(): void {
    this.n = 0;
  }

  addRope(r: ERope): void {
    const p = r.pts, m = p.length, h = r.h;
    for (let k = 0; k < m - 1; k++) this.push(r, k, p[k]!, p[k + 1]!, k === 0 ? 0 : h, k === m - 2 ? 0 : h);
  }

  addBlocker(r: ERope, base: P3, top: P3): void {
    this.push(r, -1, base, top, 0, 0);
  }

  broadphase(M: number, useZ: boolean): void {
    const segs = this.segs, n = this.n;
    let gx0 = Infinity, gy0 = Infinity, gx1 = -Infinity, gy1 = -Infinity;
    for (let i = 0; i < n; i++) {
      const s = segs[i]!, a = s.a, b = s.b;
      if (a.x < b.x) {
        s.x0 = a.x - M;
        s.x1 = b.x + M;
      } else {
        s.x0 = b.x - M;
        s.x1 = a.x + M;
      }
      if (a.y < b.y) {
        s.y0 = a.y - M;
        s.y1 = b.y + M;
      } else {
        s.y0 = b.y - M;
        s.y1 = a.y + M;
      }
      if (a.z < b.z) {
        s.z0 = a.z - M;
        s.z1 = b.z + M;
      } else {
        s.z0 = b.z - M;
        s.z1 = a.z + M;
      }
      if (s.x0 < gx0) gx0 = s.x0;
      if (s.x1 > gx1) gx1 = s.x1;
      if (s.y0 < gy0) gy0 = s.y0;
      if (s.y1 > gy1) gy1 = s.y1;
    }
    this.candN = 0;
    if (n === 0) return;
    const nx = Math.floor((gx1 - gx0) / CELL) + 1, ny = Math.floor((gy1 - gy0) / CELL) + 1, nc = nx * ny;
    if (this.cellStart.length < nc + 1) {
      this.cellStart = new Int32Array(nc * 2 + 1);
      this.cellFill = new Int32Array(nc * 2 + 1);
    }
    const start = this.cellStart, fill = this.cellFill;
    start.fill(0, 0, nc + 1);
    let total = 0;
    for (let i = 0; i < n; i++) {
      const s = segs[i]!;
      s.cx = Math.floor((s.x0 - gx0) / CELL);
      s.cx1 = Math.floor((s.x1 - gx0) / CELL);
      s.cy = Math.floor((s.y0 - gy0) / CELL);
      s.cy1 = Math.floor((s.y1 - gy0) / CELL);
      for (let cy = s.cy; cy <= s.cy1; cy++) {
        for (let cx = s.cx; cx <= s.cx1; cx++) {
          const c = cy * nx + cx + 1;
          start[c] = start[c]! + 1;
          total++;
        }
      }
    }
    for (let c = 0; c < nc; c++) {
      start[c + 1] = start[c + 1]! + start[c]!;
      fill[c] = start[c]!;
    }
    if (this.items.length < total) this.items = new Int32Array(total * 2);
    const items = this.items;
    for (let i = 0; i < n; i++) {
      const s = segs[i]!;
      for (let cy = s.cy; cy <= s.cy1; cy++) {
        for (let cx = s.cx; cx <= s.cx1; cx++) {
          const c = cy * nx + cx, slot = fill[c]!;
          fill[c] = slot + 1;
          items[slot] = i;
        }
      }
    }
    let cand = this.cand, cn = 0;
    for (let c = 0; c < nc; c++) {
      const e = start[c + 1]!, cxc = c % nx, cyc = (c - cxc) / nx;
      for (let p = start[c]!; p < e; p++) {
        const i = items[p]!, si = segs[i]!;
        for (let q = p + 1; q < e; q++) {
          const j = items[q]!, sj = segs[j]!;
          if (si.rope === sj.rope && (si.k < 0 || sj.k < 0 || sj.k - si.k < SELF_GAP)) continue;
          if (si.x1 < sj.x0 || sj.x1 < si.x0 || si.y1 < sj.y0 || sj.y1 < si.y0) continue;
          if (useZ && (si.z1 < sj.z0 || sj.z1 < si.z0)) continue;
          if ((si.cx > sj.cx ? si.cx : sj.cx) !== cxc || (si.cy > sj.cy ? si.cy : sj.cy) !== cyc) continue;
          if (cn + 2 > cand.length) {
            const g = new Int32Array(cand.length * 2);
            g.set(cand);
            cand = this.cand = g;
          }
          cand[cn++] = i;
          cand[cn++] = j;
        }
      }
    }
    this.candN = cn;
  }

  activePairs(d: number): void {
    const segs = this.segs, cand = this.cand, cn = this.candN, cp = this.cp;
    const lim2 = (d + MARGIN) * (d + MARGIN), hot2 = (d + 1) * (d + 1);
    if (this.hot.length < cn) {
      this.hot = new Int32Array(cn * 2);
      this.warm = new Int32Array(cn * 2);
    }
    const hot = this.hot, warm = this.warm;
    let hn = 0, wn = 0;
    for (let i = 0; i < cn; i += 2) {
      const ia = cand[i]!, ib = cand[i + 1]!;
      const sa = segs[ia]!, sb = segs[ib]!;
      const a1 = sa.a, a2 = sa.b, b1 = sb.a, b2 = sb.b;
      closestSegSeg(a1, a2, b1, b2, cp);
      const s = cp.s, t = cp.t;
      const nx = a1.x + (a2.x - a1.x) * s - b1.x - (b2.x - b1.x) * t;
      const ny = a1.y + (a2.y - a1.y) * s - b1.y - (b2.y - b1.y) * t;
      const nz = a1.z + (a2.z - a1.z) * s - b1.z - (b2.z - b1.z) * t;
      const d2 = nx * nx + ny * ny + nz * nz;
      if (d2 < hot2) {
        hot[hn++] = ia;
        hot[hn++] = ib;
      } else if (d2 < lim2) {
        warm[wn++] = ia;
        warm[wn++] = ib;
      }
    }
    this.hotN = hn;
    this.warmN = wn;
  }

  solve(useWarm: boolean, d: number): number {
    const segs = this.segs, list = useWarm ? this.warm : this.hot, n = useWarm ? this.warmN : this.hotN, cp = this.cp;
    const dd = d * d;
    let minD = Infinity;
    for (let i = 0; i < n; i += 2) {
      const sa = segs[list[i]!]!, sb = segs[list[i + 1]!]!;
      const a1 = sa.a, a2 = sa.b, b1 = sb.a, b2 = sb.b;
      closestSegSeg(a1, a2, b1, b2, cp);
      const s = cp.s, t = cp.t;
      let nx = a1.x + (a2.x - a1.x) * s - b1.x - (b2.x - b1.x) * t;
      let ny = a1.y + (a2.y - a1.y) * s - b1.y - (b2.y - b1.y) * t;
      let nz = a1.z + (a2.z - a1.z) * s - b1.z - (b2.z - b1.z) * t;
      const d2 = nx * nx + ny * ny + nz * nz;
      if (d2 < minD) minD = d2;
      if (d2 >= dd) continue;
      const dist = Math.sqrt(d2);
      if (dist < 1e-6) {
        nx = 0;
        ny = 0;
        nz = a1.z + a2.z >= b1.z + b2.z ? 1 : -1;
      } else {
        nx /= dist;
        ny /= dist;
        nz /= dist;
      }
      const wa1 = (1 - s) * sa.ima, wa2 = s * sa.imb, wb1 = (1 - t) * sb.ima, wb2 = t * sb.imb;
      const den = wa1 * (1 - s) + wa2 * s + wb1 * (1 - t) + wb2 * t;
      if (den < 1e-12) continue;
      const lam = (d - dist) / den;
      a1.x += nx * lam * wa1;
      a1.y += ny * lam * wa1;
      a1.z += nz * lam * wa1;
      a2.x += nx * lam * wa2;
      a2.y += ny * lam * wa2;
      a2.z += nz * lam * wa2;
      b1.x -= nx * lam * wb1;
      b1.y -= ny * lam * wb1;
      b1.z -= nz * lam * wb1;
      b2.x -= nx * lam * wb2;
      b2.y -= ny * lam * wb2;
      b2.z -= nz * lam * wb2;
    }
    return Math.sqrt(minD);
  }

  private push(rope: ERope, k: number, a: P3, b: P3, ima: number, imb: number): void {
    const s = this.segs[this.n];
    if (s) {
      s.rope = rope;
      s.k = k;
      s.a = a;
      s.b = b;
      s.ima = ima;
      s.imb = imb;
    } else {
      this.segs.push({ rope, k, a, b, ima, imb, x0: 0, x1: 0, y0: 0, y1: 0, z0: 0, z1: 0, cx: 0, cy: 0, cx1: 0, cy1: 0 });
    }
    this.n++;
  }
}
```

`src/engine/posts.ts`:
```ts
import type { Hole } from "../board";
import { DMAX, POST_H, POST_R, POST_REACH } from "./constants";
import type { Engine } from "./engine";
import type { ERope, Particle } from "./types";

export interface PostHit {
  q: Particle;
  hole: Hole;
  free: boolean;
}

const reach = (t: number) => (t < 0 ? 0 : t > POST_REACH ? POST_REACH : t);

export function postCandidates(E: Engine, act: readonly ERope[]): PostHit[] {
  const { holes, width: bw, height: bh } = E.board;
  const R = POST_R + DMAX + 2;
  const posts = [...E.occupied()];
  const fromOf = new Map<number, number>();
  if (E.held && !E.held.lifted) fromOf.set(E.held.rope, E.held.from);
  for (const f of E.flying) if (!f.lifted) fromOf.set(f.rope, f.from);
  for (const h of fromOf.values()) if (!posts.includes(h)) posts.push(h);
  const out: PostHit[] = [];
  for (const r of act) {
    const p = r.pts, n = p.length, free = E.freeIds.has(r.id), skip = fromOf.get(r.id);
    for (let i = 1; i < n - 1; i++) {
      const q = p[i]!;
      if (q.x > R && q.x < bw - R && q.y > R && q.y < bh - R) continue;
      for (const hi of posts) {
        if (hi === r.ends[0] || hi === r.ends[1] || hi === skip) continue;
        const P = holes[hi]!;
        const t = reach((q.x - P.x) * P.ox + (q.y - P.y) * P.oy);
        const rx = q.x - P.x - P.ox * t, ry = q.y - P.y - P.oy * t;
        if (rx * rx + ry * ry < R * R) out.push({ q, hole: P, free });
      }
    }
  }
  return out;
}

export function applyPosts(list: readonly PostHit[]): void {
  for (const { q, hole: P, free } of list) {
    if (free && q.z >= POST_H) continue;
    const t = reach((q.x - P.x) * P.ox + (q.y - P.y) * P.oy);
    const rx = q.x - P.x - P.ox * t, ry = q.y - P.y - P.oy * t, d = Math.hypot(rx, ry);
    if (d >= POST_R) continue;
    const pen = POST_R - d, push = pen < 2 ? pen : 2;
    let dx = rx - P.ox * pen * 0.5, dy = ry - P.oy * pen * 0.5;
    const l = Math.hypot(dx, dy);
    if (l < 1e-9) {
      dx = -P.ox;
      dy = -P.oy;
    } else {
      dx /= l;
      dy /= l;
    }
    q.x += dx * push;
    q.y += dy * push;
  }
}
```

`src/engine/monitor.ts`:
```ts
import type { PhysCrossing, Signature } from "./types";

export interface FlagRecord {
  kind: "flip" | "illegal";
  step: number;
  pair: number;
  before: PhysCrossing[];
  after: PhysCrossing[];
}

export function legalEdit(O: readonly PhysCrossing[], N: readonly PhysCrossing[], ids: ReadonlySet<number>): boolean {
  const n = O.length, m = N.length, memo = new Map<number, boolean>();
  const go = (i: number, j: number): boolean => {
    if (i === n && j === m) return true;
    const key = i * 4096 + j;
    const known = memo.get(key);
    if (known !== undefined) return known;
    let ok = false;
    if (i < n && j < m && O[i]!.over === N[j]!.over) ok = go(i + 1, j + 1);
    if (!ok && i < n && ids.has(O[i]!.over)) ok = go(i + 1, j);
    if (!ok && j < m && ids.has(N[j]!.over)) ok = go(i, j + 1);
    if (!ok && i + 1 < n && O[i]!.over === O[i + 1]!.over) ok = go(i + 2, j);
    if (!ok && j + 1 < m && N[j]!.over === N[j + 1]!.over) ok = go(i, j + 2);
    memo.set(key, ok);
    return ok;
  };
  return go(0, 0);
}

const byB = (arr: readonly PhysCrossing[]) => arr.slice().sort((p, q) => p.ub - q.ub);

export class Monitor {
  count = 0;
  readonly kinds = { flip: 0, illegal: 0 };
  readonly log: FlagRecord[] = [];
  private prev: Signature | null = null;

  observe(sig: Signature, free: ReadonlySet<number>, lastHeld: number, step: number): void {
    const prev = this.prev;
    this.prev = sig;
    if (!prev) return;
    const ids: ReadonlySet<number> = free.size > 0 ? free : new Set([lastHeld]);
    for (const key of new Set([...prev.keys(), ...sig.keys()])) {
      const O = prev.get(key) ?? [], N = sig.get(key) ?? [];
      if (legalEdit(O, N, ids) || legalEdit(byB(O), byB(N), ids)) continue;
      const kind = O.length === N.length ? "flip" : "illegal";
      this.kinds[kind]++;
      this.count++;
      if (this.log.length < 20) this.log.push({ kind, step, pair: key, before: O, after: N });
    }
  }
}
```

`src/engine/engine.ts`:
```ts
import type { Board, Hole } from "../board";
import type { Point } from "../util/point";
import { Collider } from "./collider";
import {
  BLOCKER_H, CLEARANCE, D, DAMP, DMAX, H0, HOLD_RADIUS, ITER, LAND_WAIT, LIFT, MARGIN, OMEGA, POST_R, STEP, VCUT, VMAX, VREST, WARM_EVERY,
} from "./constants";
import { segCross } from "./geom3";
import type { Monitor } from "./monitor";
import { applyPosts, postCandidates } from "./posts";
import {
  pairKey, particle, type ERope, type FlyingEnd, type HeldEnd, type LandingEnd, type P3, type Particle, type PhysCrossing, type Signature,
} from "./types";

interface EndState {
  rope: number;
  end: 0 | 1;
  lifted: boolean;
}

export class Engine {
  readonly board: Board;
  ropes: ERope[] = [];
  held: HeldEnd | null = null;
  flying: FlyingEnd[] = [];
  landing: LandingEnd[] = [];
  contactD = D;
  resampleOn = true;
  zTension = true;
  monitor: Monitor | null = null;
  drift = Infinity;
  substeps = 0;
  minDist = Infinity;
  lastMinD = Infinity;
  maxSpeed = 0;
  lastHeld = -1;
  readonly freeIds = new Set<number>();
  private readonly col = new Collider();
  private readonly blockTop: P3 = { x: 0, y: 0, z: 0 };
  private winN = 0;

  constructor(board: Board) {
    this.board = board;
  }

  hole(i: number): Hole {
    const h = this.board.holes[i];
    if (!h) throw new Error(`no hole ${i}`);
    return h;
  }

  rope(id: number): ERope {
    const r = this.ropes[id];
    if (!r) throw new Error(`no rope ${id}`);
    return r;
  }

  addRope(points: readonly P3[], ends: [number, number]): ERope {
    if (points.length < 2) throw new Error("addRope: need at least two points");
    const r: ERope = {
      id: this.ropes.length,
      pts: points.map((q) => particle(q.x, q.y, q.z)),
      ends: [ends[0], ends[1]],
      cleared: false,
      s: new Float64Array(points.length),
      L: 0,
      h: H0,
      maxSeg: 0,
      zeroN: 0,
    };
    computeArc(r);
    this.ropes.push(r);
    return r;
  }

  straightRope(holeA: number, holeB: number): ERope {
    const A = this.hole(holeA), B = this.hole(holeB);
    const n = Math.max(2, Math.round(Math.hypot(B.x - A.x, B.y - A.y) / H0));
    const pts: P3[] = [];
    for (let i = 0; i <= n; i++) pts.push({ x: A.x + ((B.x - A.x) * i) / n, y: A.y + ((B.y - A.y) * i) / n, z: 0 });
    return this.addRope(pts, [holeA, holeB]);
  }

  active(): ERope[] {
    return this.ropes.filter((r) => !r.cleared);
  }

  endPoint(rope: number, end: 0 | 1): Particle {
    const p = this.rope(rope).pts;
    const q = end === 0 ? p[0] : p[p.length - 1];
    if (!q) throw new Error(`rope ${rope} has no points`);
    return q;
  }

  occupied(): Set<number> {
    const s = new Set<number>();
    for (const r of this.ropes) if (!r.cleared) for (const h of r.ends) if (h !== null) s.add(h);
    return s;
  }

  grab(rope: number, end: 0 | 1): void {
    const r = this.rope(rope), from = r.ends[end];
    if (from === null) throw new Error(`grab: rope ${rope} end ${end} is not in a hole`);
    this.held = { rope, end, from, lifted: false };
    r.ends[end] = null;
    this.lastHeld = rope;
  }

  attach(hole: number): void {
    const h = this.held;
    if (!h) throw new Error("attach: nothing held");
    this.land(h, hole);
    this.held = null;
  }

  release(path: readonly Point[], hole: number): void {
    const h = this.held;
    if (!h) throw new Error("release: nothing held");
    if (path.length === 0) throw new Error("release: empty path");
    this.flying.push({ ...h, path: path.map((p) => ({ x: p.x, y: p.y })), hole, top: { x: 0, y: 0, z: 0 } });
    this.held = null;
  }

  busy(): boolean {
    return this.flying.length > 0 || this.landing.length > 0;
  }

  busyRopes(): Set<number> {
    const s = new Set<number>();
    for (const f of this.flying) s.add(f.rope);
    for (const l of this.landing) s.add(l.rope);
    return s;
  }

  resetDrift(): void {
    this.drift = Infinity;
    this.winN = 0;
  }

  substep(target: Point | null): void {
    this.substeps++;
    const act = this.active();
    if (this.held) this.driveEnd(this.held, target);
    for (let i = this.flying.length - 1; i >= 0; i--) {
      const f = this.flying[i]!, T = f.path[0]!;
      this.driveEnd(f, T);
      const p = this.endPoint(f.rope, f.end);
      if (f.lifted && Math.hypot(T.x - p.x, T.y - p.y) < 1e-6) {
        f.path.shift();
        if (f.path.length === 0) {
          this.land(f, f.hole);
          this.flying.splice(i, 1);
        }
      }
    }
    for (let i = this.landing.length - 1; i >= 0; i--) {
      const l = this.landing[i]!, p = l.p;
      p.pz = p.z;
      if (l.wait < LAND_WAIT && !this.holeClear(l)) {
        l.wait++;
        continue;
      }
      p.z = Math.max(0, p.z - STEP);
      if (p.z === 0) this.landing.splice(i, 1);
    }
    integrate(act);
    this.collect(act);
    const d = this.contactD;
    this.col.broadphase((d + MARGIN) / 2 + 1, true);
    this.col.activePairs(d);
    const free = this.freeIds;
    free.clear();
    if (this.held) free.add(this.held.rope);
    for (const f of this.flying) free.add(f.rope);
    for (const l of this.landing) free.add(l.rope);
    const posts = postCandidates(this, act);
    let minD = Infinity;
    for (let it = 0; it < ITER; it++) {
      if (it === ITER >> 1) this.col.activePairs(d);
      for (const r of act) tension(r.pts, (it & 1) === 1, this.zTension);
      applyPosts(posts);
      minD = this.col.solve(false, d);
      if (it % WARM_EVERY === WARM_EVERY - 1) minD = Math.min(minD, this.col.solve(true, d));
    }
    if (minD < this.minDist) this.minDist = minD;
    this.lastMinD = minD;
    this.maxSpeed = capDisplacement(act);
    if (++this.winN >= 8) {
      this.winN = 0;
      this.drift = measureDrift(act);
    }
    if (this.monitor) this.monitor.observe(this.signature(), this.freeIds, this.lastHeld, this.substeps);
    if (this.resampleOn) {
      for (const r of act) if (r.h > 1.25 * H0 || r.h < 0.8 * H0 || r.maxSeg > 1.8 * H0) resample(r);
    }
  }

  signature(): Signature {
    const col = this.col;
    col.begin();
    for (const r of this.active()) col.addRope(r);
    col.broadphase(1, false);
    const sig: Signature = new Map();
    const segs = col.segs, cand = col.cand, cn = col.candN;
    for (let i = 0; i < cn; i += 2) {
      let sa = segs[cand[i]!]!, sb = segs[cand[i + 1]!]!;
      if (sa.rope === sb.rope) continue;
      if (sa.rope.id > sb.rope.id) [sa, sb] = [sb, sa];
      const hit = segCross(sa.a, sa.b, sb.a, sb.b);
      if (!hit) continue;
      const A = sa.rope, B = sb.rope, tA = hit[0], tB = hit[1];
      const za = sa.a.z + (sa.b.z - sa.a.z) * tA, zb = sb.a.z + (sb.b.z - sb.a.z) * tB;
      const c: PhysCrossing = {
        a: A.id,
        b: B.id,
        over: za >= zb ? A.id : B.id,
        dz: za - zb,
        x: sa.a.x + (sa.b.x - sa.a.x) * tA,
        y: sa.a.y + (sa.b.y - sa.a.y) * tA,
        ua: A.s[sa.k]! + (A.s[sa.k + 1]! - A.s[sa.k]!) * tA,
        ub: B.s[sb.k]! + (B.s[sb.k + 1]! - B.s[sb.k]!) * tB,
      };
      const key = pairKey(A.id, B.id);
      let arr = sig.get(key);
      if (!arr) sig.set(key, (arr = []));
      arr.push(c);
    }
    for (const arr of sig.values()) arr.sort((p, q) => p.ua - q.ua);
    return sig;
  }

  crossingCounts(): Map<number, number> {
    const out = new Map<number, number>();
    for (const arr of this.signature().values()) {
      for (const c of arr) {
        out.set(c.a, (out.get(c.a) ?? 0) + 1);
        out.set(c.b, (out.get(c.b) ?? 0) + 1);
      }
    }
    return out;
  }

  clearFree(minStreak: number): number[] {
    const counts = this.crossingCounts();
    const cleared: number[] = [];
    for (const r of this.active()) {
      if (r.ends[0] === null || r.ends[1] === null || (counts.get(r.id) ?? 0) > 0) {
        r.zeroN = 0;
        continue;
      }
      r.zeroN++;
      if (r.zeroN >= minStreak) {
        r.cleared = true;
        cleared.push(r.id);
      }
    }
    return cleared;
  }

  private land(h: EndState, hole: number): void {
    const r = this.rope(h.rope), p = this.endPoint(h.rope, h.end), P = this.hole(hole);
    r.ends[h.end] = hole;
    p.x = p.px = P.x;
    p.y = p.py = P.y;
    this.landing.push({ p, hole, rope: r.id, wait: 0, top: { x: p.x, y: p.y, z: p.z + BLOCKER_H } });
  }

  private driveEnd(h: EndState, target: Point | null): void {
    const p = this.endPoint(h.rope, h.end);
    p.px = p.x;
    p.py = p.y;
    p.pz = p.z;
    const zt = this.holdHeight(p, h.rope);
    p.z = p.z < zt ? Math.min(zt, p.z + STEP) : Math.max(zt, p.z - STEP);
    if (!h.lifted && p.z >= LIFT - 1e-9) h.lifted = true;
    if (h.lifted && target) {
      const dx = target.x - p.x, dy = target.y - p.y, d = Math.hypot(dx, dy);
      if (d > 1e-9) {
        const s = Math.min(STEP, d);
        p.x += (dx / d) * s;
        p.y += (dy / d) * s;
      }
    }
  }

  private holdHeight(p: P3, rope: number): number {
    const r2 = HOLD_RADIUS * HOLD_RADIUS;
    let m = 0;
    for (const r of this.ropes) {
      if (r.cleared || r.id === rope) continue;
      for (const q of r.pts) {
        if (q.z <= m) continue;
        const dx = q.x - p.x, dy = q.y - p.y;
        if (dx * dx + dy * dy < r2) m = q.z;
      }
    }
    return Math.max(LIFT, m + CLEARANCE);
  }

  private holeClear(l: LandingEnd): boolean {
    const P = this.hole(l.hole), R2 = (POST_R - 2) * (POST_R - 2);
    for (const r of this.ropes) {
      if (r.cleared || r.id === l.rope) continue;
      for (const q of r.pts) {
        const dx = q.x - P.x, dy = q.y - P.y;
        if (dx * dx + dy * dy < R2 && q.z < l.p.z) return false;
      }
    }
    return true;
  }

  private collect(act: readonly ERope[]): void {
    const col = this.col;
    col.begin();
    for (const r of act) col.addRope(r);
    if (this.held) {
      const e = this.endPoint(this.held.rope, this.held.end), top = this.blockTop;
      top.x = e.x;
      top.y = e.y;
      top.z = e.z + BLOCKER_H;
      col.addBlocker(this.rope(this.held.rope), e, top);
    }
    for (const f of this.flying) {
      const e = this.endPoint(f.rope, f.end);
      f.top.x = e.x;
      f.top.y = e.y;
      f.top.z = e.z + BLOCKER_H;
      col.addBlocker(this.rope(f.rope), e, f.top);
    }
    for (const l of this.landing) {
      l.top.z = l.p.z + BLOCKER_H;
      col.addBlocker(this.rope(l.rope), l.p, l.top);
    }
  }
}

export function computeArc(r: ERope): void {
  const p = r.pts, s = new Float64Array(p.length);
  let mx = 0;
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1]!, b = p[i]!;
    const l = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (l > mx) mx = l;
    s[i] = s[i - 1]! + l;
  }
  r.s = s;
  r.L = s[p.length - 1]!;
  r.h = r.L / (p.length - 1);
  r.maxSeg = mx;
}

function resample(r: ERope): void {
  const p = r.pts, n = p.length - 1, s = r.s, L = r.L;
  const m = Math.max(2, Math.round(L / H0));
  const out: Particle[] = [p[0]!];
  let k = 0;
  for (let j = 1; j < m; j++) {
    const u = (L * j) / m;
    while (k < n - 1 && s[k + 1]! < u) k++;
    const seg = s[k + 1]! - s[k]!, t = seg > 1e-12 ? (u - s[k]!) / seg : 0, a = p[k]!, b = p[k + 1]!;
    out.push({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t,
      px: a.px + (b.px - a.px) * t,
      py: a.py + (b.py - a.py) * t,
      pz: a.pz + (b.pz - a.pz) * t,
      rx: Number.NaN,
      ry: Number.NaN,
      rz: Number.NaN,
    });
  }
  out.push(p[n]!);
  r.pts = out;
  computeArc(r);
}

function integrate(act: readonly ERope[]): void {
  for (const r of act) {
    const p = r.pts, n = p.length;
    for (let i = 1; i < n - 1; i++) {
      const q = p[i]!;
      let vx = (q.x - q.px) * DAMP, vy = (q.y - q.py) * DAMP, vz = (q.z - q.pz) * DAMP;
      const v = Math.hypot(vx, vy, vz);
      if (v > VMAX) {
        const k = VMAX / v;
        vx *= k;
        vy *= k;
        vz *= k;
      } else if (v < VREST) {
        const k = v < VCUT ? 0 : (v - VCUT) / (VREST - VCUT);
        vx *= k;
        vy *= k;
        vz *= k;
      }
      q.px = q.x;
      q.py = q.y;
      q.pz = q.z;
      q.x += vx;
      q.y += vy;
      q.z += vz;
    }
  }
}

function tension(p: Particle[], backward: boolean, withZ: boolean): void {
  const n = p.length;
  if (backward) for (let i = n - 2; i >= 1; i--) pull(p, i, withZ);
  else for (let i = 1; i < n - 1; i++) pull(p, i, withZ);
}

function pull(p: Particle[], i: number, withZ: boolean): void {
  const q = p[i]!, a = p[i - 1]!, b = p[i + 1]!;
  q.x += OMEGA * ((a.x + b.x) * 0.5 - q.x);
  q.y += OMEGA * ((a.y + b.y) * 0.5 - q.y);
  if (withZ) q.z += OMEGA * ((a.z + b.z) * 0.5 - q.z);
}

function capDisplacement(act: readonly ERope[]): number {
  let maxv = 0;
  for (const r of act) {
    const p = r.pts, n = p.length;
    for (let i = 1; i < n - 1; i++) {
      const q = p[i]!;
      const dx = q.x - q.px, dy = q.y - q.py, dz = q.z - q.pz, d = Math.hypot(dx, dy, dz);
      if (d > DMAX) {
        const k = DMAX / d;
        q.x = q.px + dx * k;
        q.y = q.py + dy * k;
        q.z = q.pz + dz * k;
      }
      if (d > maxv) maxv = d;
    }
    computeArc(r);
  }
  return maxv;
}

function measureDrift(act: readonly ERope[]): number {
  let dr = 0;
  for (const r of act) {
    const p = r.pts;
    for (let i = 1; i < p.length - 1; i++) {
      const q = p[i]!;
      const d = Number.isNaN(q.rx) ? 1 : Math.hypot(q.x - q.rx, q.y - q.ry, q.z - q.rz);
      if (d > dr) dr = d;
      q.rx = q.x;
      q.ry = q.y;
      q.rz = q.z;
    }
  }
  return dr;
}
```

`src/engine/settle.ts`:
```ts
import type { Engine } from "./engine";

export function settle(E: Engine, max = 800, eps = 0.15): number {
  E.resetDrift();
  for (let i = 0; i < max; i++) {
    E.substep(null);
    if (E.drift < eps && !E.busy()) return i + 1;
  }
  return max;
}
```

`src/engine/index.ts`:
```ts
export * from "./constants";
export * from "./types";
export * from "./engine";
export * from "./monitor";
export * from "./settle";
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- tests/engine-core.test.ts`
Expected: PASS. If the contact test fails on `dz`, print `E.lastMinD` and the crossing's `dz`; the spike settled single crossings at about 15.5, so a value far below that means a port error in `solve` (check the sign of the `b` updates), not a constant to tune.

- [ ] **Step 5: Full suite, typecheck, lint, commit**

Run: `npm test && npm run typecheck && npm run lint`

```bash
git add src/engine tests/engine-core.test.ts
git commit -m "feat: port the rope physics engine"
```

---

### Task 3: Ends and pegs

**Files:**
- Create: `src/engine/script.ts`
- Modify: `src/engine/index.ts` (add `export * from "./script";`)
- Test: `tests/engine-ends.test.ts`

**Interfaces:**
- Consumes: `Engine`, `settle` (Task 2).
- Produces:
```ts
export function insetPoint(board: Board, P: Point, d: number): Point;          // d units from P toward the board center
export function scriptedMove(E: Engine, rope: number, end: 0 | 1, toHole: number, settleMax?: number): void;
```
- `scriptedMove` grabs the end, drives it through two inset waypoints to the target hole, attaches it, and settles (spike `simulateMove`).

- [ ] **Step 1: Write the failing test**

`tests/engine-ends.test.ts`:
```ts
import { rimBoard, type Board } from "../src/board";
import { LIFT, POST_R } from "../src/engine/constants";
import { Engine } from "../src/engine/engine";
import { scriptedMove } from "../src/engine/script";
import { settle } from "../src/engine/settle";
import type { P3 } from "../src/engine/types";

function holeAt(board: Board, x: number, y: number): number {
  const i = board.holes.findIndex((h) => h.x === x && h.y === y);
  if (i < 0) throw new Error(`no hole at ${x},${y}`);
  return i;
}

describe("ends", () => {
  it("lifts a held end before moving it sideways", () => {
    const board = rimBoard(4, 5), E = new Engine(board);
    E.straightRope(holeAt(board, 64, 0), holeAt(board, 128, 0));
    E.grab(0, 0);
    const target = { x: 96, y: 128 };
    for (let i = 0; i < 14; i++) E.substep(target);
    const p = E.endPoint(0, 0);
    expect(p.x).toBe(64);
    expect(p.y).toBe(0);
    expect(p.z).toBeCloseTo(42);
    E.substep(target);
    expect(E.held?.lifted).toBe(true);
    expect(p.z).toBeCloseTo(LIFT);
    expect(Math.hypot(p.x - 64, p.y)).toBeCloseTo(3);
  });

  it("lands a moved end in its new hole at rest height", () => {
    const board = rimBoard(4, 5), E = new Engine(board);
    E.straightRope(holeAt(board, 64, 0), holeAt(board, 128, 0));
    const to = holeAt(board, 192, 128);
    scriptedMove(E, 0, 0, to);
    expect(E.ropes[0]!.ends[0]).toBe(to);
    expect(E.endPoint(0, 0)).toMatchObject({ x: 192, y: 128, z: 0 });
    expect(E.held).toBeNull();
    expect(E.busy()).toBe(false);
  });

  it("lets a released end fly home while another end is held", () => {
    const board = rimBoard(4, 5), E = new Engine(board);
    E.straightRope(holeAt(board, 64, 0), holeAt(board, 128, 0));
    E.straightRope(holeAt(board, 64, 256), holeAt(board, 128, 256));
    const to = holeAt(board, 192, 128);
    E.grab(0, 0);
    E.release([{ x: 96, y: 128 }, { x: 192, y: 128 }], to);
    expect(E.busyRopes()).toEqual(new Set([0]));
    E.grab(1, 1);
    const hold = { x: 128, y: 256 };
    for (let guard = 0; E.busy() && guard < 5000; guard++) E.substep(hold);
    expect(E.busy()).toBe(false);
    expect(E.ropes[0]!.ends[0]).toBe(to);
    expect(E.held).toMatchObject({ rope: 1, end: 1 });
  });
});

describe("pegs", () => {
  it("keeps a rope on the board side of another rope's pegs", () => {
    const board = rimBoard(5, 6), E = new Engine(board);
    E.straightRope(holeAt(board, 0, 128), holeAt(board, 0, 192));
    const pts: P3[] = [];
    for (let i = 0; i <= 24; i++) pts.push({ x: 0, y: 64 + 8 * i, z: i === 0 || i === 24 ? 0 : 20 });
    E.addRope(pts, [holeAt(board, 0, 64), holeAt(board, 0, 256)]);
    settle(E);
    for (const p of E.ropes[1]!.pts) if (p.y >= 128 && p.y <= 192) expect(p.x).toBeGreaterThan(POST_R - 3);
    expect([...E.signature().values()].flat()).toHaveLength(0);
  });
});

describe("clearing", () => {
  it("clears a rope that has crossed nothing for the required streak", () => {
    const board = rimBoard(4, 5), E = new Engine(board);
    E.straightRope(holeAt(board, 0, 64), holeAt(board, 192, 64));
    expect(E.clearFree(3)).toEqual([]);
    expect(E.clearFree(3)).toEqual([]);
    expect(E.clearFree(3)).toEqual([0]);
    expect(E.active()).toHaveLength(0);
  });

  it("does not clear a rope while one of its ends is held", () => {
    const board = rimBoard(4, 5), E = new Engine(board);
    E.straightRope(holeAt(board, 0, 64), holeAt(board, 192, 64));
    E.grab(0, 1);
    expect(E.clearFree(1)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- tests/engine-ends.test.ts`
Expected: FAIL, `../src/engine/script` not found.

- [ ] **Step 3: Implement**

`src/engine/script.ts`:
```ts
import type { Board } from "../board";
import type { Point } from "../util/point";
import type { Engine } from "./engine";
import { settle } from "./settle";

export function insetPoint(board: Board, P: Point, d: number): Point {
  const cx = board.width / 2, cy = board.height / 2;
  const dx = cx - P.x, dy = cy - P.y, l = Math.hypot(dx, dy);
  return { x: P.x + (dx / l) * d, y: P.y + (dy / l) * d };
}

export function scriptedMove(E: Engine, rope: number, end: 0 | 1, toHole: number, settleMax = 800): void {
  const from = E.rope(rope).ends[end];
  if (from === null) throw new Error(`scriptedMove: rope ${rope} end ${end} is not in a hole`);
  const A = E.hole(from), B = E.hole(toHole);
  E.grab(rope, end);
  const path = [insetPoint(E.board, A, 24), insetPoint(E.board, B, 24), { x: B.x, y: B.y }];
  let guard = 0;
  for (const T of path) {
    while (guard++ < 20000) {
      E.substep(T);
      const c = E.endPoint(rope, end);
      if (E.held?.lifted && Math.hypot(T.x - c.x, T.y - c.y) < 1e-6) break;
    }
  }
  E.attach(toHole);
  settle(E, settleMax);
}
```

Add to `src/engine/index.ts`: `export * from "./script";`

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- tests/engine-ends.test.ts`
Expected: PASS. A failure in the lift test means `driveEnd` is not the spike's: the end must rise by `STEP` per substep and only start moving sideways on the substep where it reaches `LIFT`.

- [ ] **Step 5: Full suite, typecheck, lint, commit**

Run: `npm test && npm run typecheck && npm run lint`

```bash
git add src/engine/script.ts src/engine/index.ts tests/engine-ends.test.ts
git commit -m "feat: add scripted moves and test ends, pegs and clearing"
```

---

### Task 4: Pass-through monitor and the move battery

**Files:**
- Test: `tests/engine-monitor.test.ts`

**Interfaces:**
- Consumes: `Monitor`, `legalEdit` (Task 2), `scriptedMove` (Task 3), `boardForRopes` (Task 1), `mulberry32`.
- Produces: nothing new; this task proves the monitor and the port against the spike's scripted-move battery (spec §11).

- [ ] **Step 1: Write the test**

`tests/engine-monitor.test.ts`:
```ts
import { boardForRopes, rimBoard, type Board } from "../src/board";
import { Engine } from "../src/engine/engine";
import { legalEdit, Monitor } from "../src/engine/monitor";
import { scriptedMove } from "../src/engine/script";
import { settle } from "../src/engine/settle";
import type { P3, PhysCrossing } from "../src/engine/types";
import { mulberry32 } from "../src/util/rng";

const c = (over: number): PhysCrossing => ({ a: 0, b: 1, over, dz: 0, x: 0, y: 0, ua: 0, ub: 0 });

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
```

- [ ] **Step 2: Run**

Run: `npm test -- tests/engine-monitor.test.ts`
Expected: PASS. If the battery reports flags, read `m.log` (pair, step, before/after) before touching any code: the spike had zero flags on normal boards, so a flag is a port error until proven otherwise. Do not change engine constants.

- [ ] **Step 3: Full suite, typecheck, lint, commit**

Run: `npm test && npm run typecheck && npm run lint`

```bash
git add tests/engine-monitor.test.ts
git commit -m "test: check the pass-through monitor and a scripted move battery"
```

---

### Task 5: Fitting a diagram to the board

**Files:**
- Create: `src/realize/errors.ts`, `src/realize/layout.ts`, `src/realize/fit.ts`, `src/realize/index.ts`
- Test: `tests/fit.test.ts`

**Interfaces:**
- Consumes: `Diagram`, `cyclicOrder`, `normAngle`, `TAU`, `intersect` (plan 1); `Board` (Task 1); `Rng` (plan 1).
- Why the extensions never cross: the extension of an end at angle `θ` with hole angle `φ` sits, at sweep stage `s`, at angle `θ + s(φ − θ)` on the ring `radius + s × (rim − radius)`. The hole angles are unwrapped to increase like the end angles and span less than one turn, so at every stage all extensions sit on the same ring in the same order. Rings for different stages are nested and all lie outside the disc.
- Produces:
```ts
export class RealizeFailed extends Error {}
export interface LNode { x: number; y: number; fixed: boolean }
export interface LRope { nodes: number[]; labels: (boolean | null)[] }   // labels[k]: true over, false under at a crossing node; null otherwise
export interface Layout { nodes: LNode[]; ropes: LRope[] }                // ropes[i] is diagram rope i, from end 0 to end 1
export interface Edge { a: number; b: number }
export function edges(L: Layout): Edge[];
export function passes(L: Layout): Map<number, [number, number][]>;      // crossing node -> [prev, next] per strand
export function edgePairOk(L: Layout, e: Edge, f: Edge): boolean;
export function rotationOk(L: Layout, node: number, list: readonly [number, number][]): boolean;
export function validLayout(L: Layout): boolean;
export function assignHoles(d: Diagram, board: Board, rng: Rng): number[];  // index rope*2+end -> hole index
export const INNER = 0.6;                                                  // disc radius as a fraction of half the shorter side
export function holeAngle(board: Board, hole: number): number;
export function rimDistance(board: Board, angle: number): number;          // center to rim along a direction
export function unwrapTargets(theta: readonly number[], target: readonly number[]): number[];
export interface Embedding { center: Point; radius: number; ends: { theta: number; phi: number }[] }   // ends indexed rope*2+end
export function embedding(d: Diagram, board: Board, holes: readonly number[]): Embedding;
export function extensionPoint(board: Board, emb: Embedding, end: number, s: number): Point;           // s = 0 on the disc edge, 1 at the hole
export function buildLayout(d: Diagram, board: Board, holes: readonly number[]): Layout;               // throws RealizeFailed
```

- [ ] **Step 1: Write the failing test**

`tests/fit.test.ts`:
```ts
import { boardForRopes, rimBoard } from "../src/board";
import { createDiagram, cyclicOrder, moveEnd, TAU, type Diagram, type EndRef } from "../src/diagram";
import { assignHoles, buildLayout, embedding, extensionPoint } from "../src/realize/fit";
import { validLayout } from "../src/realize/layout";
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
  it("starts each extension where the rope meets the disc and ends it at the hole, outside the disc", () => {
    const { diagram } = scramble(3, 6);
    const board = boardForRopes(6);
    const holes = assignHoles(diagram, board, mulberry32(3));
    const emb = embedding(diagram, board, holes);
    diagram.ends.forEach((e, key) => {
      const h = board.holes[holes[key]!]!;
      const end = extensionPoint(board, emb, key, 1);
      expect(end.x).toBeCloseTo(h.x, 6);
      expect(end.y).toBeCloseTo(h.y, 6);
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- tests/fit.test.ts`
Expected: FAIL, realize modules not found.

- [ ] **Step 3: Implement**

`src/realize/errors.ts`:
```ts
export class RealizeFailed extends Error {}
```

`src/realize/layout.ts`:
```ts
import { intersect, normAngle } from "../diagram";
import type { Point } from "../util/point";

export interface LNode {
  x: number;
  y: number;
  fixed: boolean;
}

export interface LRope {
  nodes: number[];
  labels: (boolean | null)[];
}

export interface Layout {
  nodes: LNode[];
  ropes: LRope[];
}

export interface Edge {
  a: number;
  b: number;
}

export function edges(L: Layout): Edge[] {
  const out: Edge[] = [];
  for (const r of L.ropes) for (let i = 0; i + 1 < r.nodes.length; i++) out.push({ a: r.nodes[i]!, b: r.nodes[i + 1]! });
  return out;
}

export function passes(L: Layout): Map<number, [number, number][]> {
  const out = new Map<number, [number, number][]>();
  for (const r of L.ropes) {
    for (let k = 1; k + 1 < r.nodes.length; k++) {
      if ((r.labels[k] ?? null) === null) continue;
      const n = r.nodes[k]!;
      let list = out.get(n);
      if (!list) out.set(n, (list = []));
      list.push([r.nodes[k - 1]!, r.nodes[k + 1]!]);
    }
  }
  return out;
}

function overlapAtShared(s: Point, p: Point, q: Point): boolean {
  const ux = p.x - s.x, uy = p.y - s.y, vx = q.x - s.x, vy = q.y - s.y;
  const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
  if (lu < 1e-9 || lv < 1e-9) return true;
  return Math.abs(ux * vy - uy * vx) <= 1e-9 * lu * lv && ux * vx + uy * vy > 0;
}

export function edgePairOk(L: Layout, e: Edge, f: Edge): boolean {
  const N = L.nodes;
  const sharedA = e.a === f.a || e.a === f.b, sharedB = e.b === f.a || e.b === f.b;
  if (sharedA && sharedB) return false;
  if (sharedA || sharedB) {
    const s = sharedA ? e.a : e.b, p = sharedA ? e.b : e.a, q = f.a === s ? f.b : f.a;
    return !overlapAtShared(N[s]!, N[p]!, N[q]!);
  }
  return intersect(N[e.a]!, N[e.b]!, N[f.a]!, N[f.b]!).kind === "none";
}

export function rotationOk(L: Layout, node: number, list: readonly [number, number][]): boolean {
  if (list.length !== 2) return true;
  const c = L.nodes[node]!;
  const ang = (i: number): number => {
    const n = L.nodes[i]!;
    return Math.atan2(n.y - c.y, n.x - c.x);
  };
  const pa = list[0]!, pb = list[1]!;
  const a1 = ang(pa[0]), span = normAngle(ang(pa[1]) - a1);
  const inside = (i: number) => normAngle(ang(i) - a1) < span;
  return inside(pb[0]) !== inside(pb[1]);
}

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

function boxOf(L: Layout, e: Edge): Box {
  const a = L.nodes[e.a]!, b = L.nodes[e.b]!;
  return { x0: Math.min(a.x, b.x) - 1e-9, x1: Math.max(a.x, b.x) + 1e-9, y0: Math.min(a.y, b.y) - 1e-9, y1: Math.max(a.y, b.y) + 1e-9 };
}

export function validLayout(L: Layout): boolean {
  const es = edges(L);
  const boxes = es.map((e) => boxOf(L, e));
  for (let i = 0; i < es.length; i++) {
    const bi = boxes[i]!;
    for (let j = i + 1; j < es.length; j++) {
      const bj = boxes[j]!;
      if (bi.x1 < bj.x0 || bj.x1 < bi.x0 || bi.y1 < bj.y0 || bj.y1 < bi.y0) continue;
      if (!edgePairOk(L, es[i]!, es[j]!)) return false;
    }
  }
  for (const [node, list] of passes(L)) if (!rotationOk(L, node, list)) return false;
  return true;
}
```

`src/realize/fit.ts`:
```ts
import type { Board } from "../board";
import { cyclicOrder, normAngle, TAU, type Diagram } from "../diagram";
import type { Point } from "../util/point";
import type { Rng } from "../util/rng";
import { RealizeFailed } from "./errors";
import { validLayout, type Layout, type LNode } from "./layout";

export const INNER = 0.6;
const EXT_STEP = 16;
const MIN_SAMPLES = 4;
const REFINES = 6;

const wrapPi = (a: number) => normAngle(a + Math.PI) - Math.PI;

export function holeAngle(board: Board, hole: number): number {
  const h = board.holes[hole];
  if (!h) throw new Error(`no hole ${hole}`);
  return Math.atan2(h.y - board.height / 2, h.x - board.width / 2);
}

export function rimDistance(board: Board, angle: number): number {
  const dx = Math.abs(Math.cos(angle)), dy = Math.abs(Math.sin(angle));
  const sx = dx > 1e-12 ? board.width / 2 / dx : Infinity;
  const sy = dy > 1e-12 ? board.height / 2 / dy : Infinity;
  return Math.min(sx, sy);
}

export function unwrapTargets(theta: readonly number[], target: readonly number[]): number[] {
  const phi: number[] = [theta[0]! + wrapPi(target[0]! - theta[0]!)];
  for (let i = 1; i < target.length; i++) phi.push(phi[i - 1]! + normAngle(target[i]! - phi[i - 1]!));
  const mean = phi.reduce((sum, v, i) => sum + v - theta[i]!, 0) / phi.length;
  const shift = TAU * Math.round(mean / TAU);
  return phi.map((v) => v - shift);
}

export function assignHoles(d: Diagram, board: Board, rng: Rng): number[] {
  const order = cyclicOrder(d);
  const m = board.holes.length, k = order.length;
  if (k > m) throw new RealizeFailed(`assignHoles: ${k} ends but ${m} holes`);
  const idx = [...Array(m).keys()];
  for (let i = m - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [idx[i], idx[j]] = [idx[j]!, idx[i]!];
  }
  const chosen = idx.slice(0, k).sort((a, b) => a - b);
  const theta = order.map((e) => e.angle);
  const angles = chosen.map((h) => holeAngle(board, h));
  let bestR = 0, bestCost = Infinity;
  for (let r = 0; r < k; r++) {
    const phi = unwrapTargets(theta, theta.map((_, i) => angles[(i + r) % k]!));
    const cost = phi.reduce((sum, v, i) => sum + (v - theta[i]!) ** 2, 0);
    if (cost < bestCost) {
      bestCost = cost;
      bestR = r;
    }
  }
  const holes = Array.from({ length: k }, () => -1);
  order.forEach((e, i) => {
    holes[e.rope * 2 + e.end] = chosen[(i + bestR) % k]!;
  });
  return holes;
}

export interface Embedding {
  center: Point;
  radius: number;
  ends: { theta: number; phi: number }[];
}

export function embedding(d: Diagram, board: Board, holes: readonly number[]): Embedding {
  const order = cyclicOrder(d);
  const theta = order.map((e) => e.angle);
  const phi = unwrapTargets(theta, order.map((e) => holeAngle(board, holes[e.rope * 2 + e.end]!)));
  const ends = Array.from({ length: d.ends.length }, () => ({ theta: 0, phi: 0 }));
  order.forEach((e, i) => {
    ends[e.rope * 2 + e.end] = { theta: theta[i]!, phi: phi[i]! };
  });
  return { center: { x: board.width / 2, y: board.height / 2 }, radius: (INNER * Math.min(board.width, board.height)) / 2, ends };
}

export function extensionPoint(board: Board, emb: Embedding, end: number, s: number): Point {
  const e = emb.ends[end];
  if (!e) throw new Error(`no end ${end}`);
  const a = e.theta + s * (e.phi - e.theta);
  const rho = emb.radius + s * (rimDistance(board, a) - emb.radius);
  return { x: emb.center.x + rho * Math.cos(a), y: emb.center.y + rho * Math.sin(a) };
}

function sampleCount(board: Board, emb: Embedding): number {
  let k = MIN_SAMPLES;
  for (const e of emb.ends) {
    const rim = rimDistance(board, e.phi);
    const len = (Math.abs(e.phi - e.theta) * (emb.radius + rim)) / 2 + (rim - emb.radius);
    k = Math.max(k, Math.ceil(len / EXT_STEP));
  }
  return k;
}

function sampleLayout(d: Diagram, board: Board, holes: readonly number[], emb: Embedding, samples: number): Layout {
  const nodes: LNode[] = [];
  const crossingNode = new Map<number, number>();
  const add = (p: Point, fixed: boolean): number => {
    nodes.push({ x: p.x, y: p.y, fixed });
    return nodes.length - 1;
  };
  const inDisc = (v: Point): Point => ({ x: emb.center.x + emb.radius * v.x, y: emb.center.y + emb.radius * v.y });
  const ropes = d.ropes.map((rope) => {
    const vs = rope.vertices, last = vs.length - 1;
    const ids: number[] = [], labels: (boolean | null)[] = [];
    const push = (n: number, label: boolean | null) => {
      ids.push(n);
      labels.push(label);
    };
    push(add(board.holes[holes[rope.id * 2]!]!, true), null);
    for (let j = samples - 1; j >= 1; j--) push(add(extensionPoint(board, emb, rope.id * 2, j / samples), false), null);
    vs.forEach((v, i) => {
      if (v.kind === "crossing" && i > 0 && i < last) {
        const id = v.crossingId!;
        let n = crossingNode.get(id);
        if (n === undefined) {
          n = add(inDisc(v), false);
          crossingNode.set(id, n);
        }
        push(n, v.overHere === true);
      } else {
        push(add(inDisc(v), false), null);
      }
    });
    for (let j = 1; j < samples; j++) push(add(extensionPoint(board, emb, rope.id * 2 + 1, j / samples), false), null);
    push(add(board.holes[holes[rope.id * 2 + 1]!]!, true), null);
    return { nodes: ids, labels };
  });
  return { nodes, ropes };
}

export function buildLayout(d: Diagram, board: Board, holes: readonly number[]): Layout {
  const emb = embedding(d, board, holes);
  let samples = sampleCount(board, emb);
  for (let attempt = 0; attempt < REFINES; attempt++) {
    const layout = sampleLayout(d, board, holes, emb, samples);
    if (validLayout(layout)) return layout;
    samples *= 2;
  }
  throw new RealizeFailed("fit: no valid layout after refining");
}
```

`src/realize/index.ts`:
```ts
export * from "./errors";
export * from "./layout";
export * from "./fit";
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- tests/fit.test.ts`
Expected: PASS. A scratch run of this code before the plan was finalized built valid layouts for 300 scrambles (4, 7 and 10 ropes) in about 0.2 ms each without refinement. If `buildLayout` throws for a seed, find which check fails (an edge pair or a rotation) first; a failing rotation check usually means a crossing node's strands were wired to the wrong neighbors.

- [ ] **Step 5: Full suite, typecheck, lint, commit**

Run: `npm test && npm run typecheck && npm run lint`

```bash
git add src/realize tests/fit.test.ts
git commit -m "feat: fit scrambled diagrams to the board with extensions to the holes"
```

---

### Task 6: Spreading the layout

**Files:**
- Create: `src/realize/relax.ts`
- Modify: `src/realize/index.ts` (add `export * from "./relax";`)
- Test: `tests/relax.test.ts`

**Interfaces:**
- Consumes: `Layout`, `edges`, `passes`, `edgePairOk`, `rotationOk`, `validLayout` (Task 5); `D` (Task 2).
- Produces:
```ts
export const RELAX_ITERATIONS = 60;
export function relax(L: Layout, iterations?: number): void;   // mutates node positions; fixed nodes never move; validity preserved
```
- A free node's step is `0.5 × (average of its neighbors − it)` plus, for every node closer than `D`, `0.5 × (D − dist)` along the direction away from it. The step is capped at `0.45 ×` the distance to the nearest edge not incident to the node. It is accepted only if no other node lies in any swept triangle `(old, new, neighbor)`, no incident edge meets a non-adjacent edge or overlaps an adjacent one, and the strands still alternate at the node and at its crossing neighbors. A rejected step is retried once at half length.

- [ ] **Step 1: Write the failing test**

`tests/relax.test.ts`:
```ts
import { boardForRopes, rimBoard } from "../src/board";
import { createDiagram, cyclicOrder, moveEnd, type Diagram, type EndRef } from "../src/diagram";
import { assignHoles, buildLayout } from "../src/realize/fit";
import { validLayout, type Layout } from "../src/realize/layout";
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- tests/relax.test.ts`
Expected: FAIL, `../src/realize/relax` not found.

- [ ] **Step 3: Implement**

`src/realize/relax.ts`:
```ts
import { D } from "../engine/constants";
import type { Point } from "../util/point";
import { edgePairOk, edges, passes, rotationOk, type Edge, type Layout } from "./layout";

export const RELAX_ITERATIONS = 60;
const PULL = 0.5;
const PUSH = 0.5;
const ROOM = 0.45;

interface Graph {
  es: Edge[];
  incident: number[][];
  nbrs: number[][];
  passes: Map<number, [number, number][]>;
}

function side(a: Point, b: Point, p: Point): number {
  return (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
}

function inTriangle(p: Point, a: Point, b: Point, c: Point): boolean {
  const d1 = side(a, b, p), d2 = side(b, c, p), d3 = side(c, a, p);
  const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

function pointSegDist(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.y - a.y - dy * t);
}

function graphOf(L: Layout): Graph {
  const es = edges(L);
  const incident: number[][] = L.nodes.map(() => []);
  const nbrs: number[][] = L.nodes.map(() => []);
  es.forEach((e, i) => {
    incident[e.a]!.push(i);
    incident[e.b]!.push(i);
    nbrs[e.a]!.push(e.b);
    nbrs[e.b]!.push(e.a);
  });
  return { es, incident, nbrs, passes: passes(L) };
}

function clearance(L: Layout, g: Graph, n: number): number {
  const p = L.nodes[n]!, inc = g.incident[n]!;
  let best = Infinity;
  g.es.forEach((e, i) => {
    if (!inc.includes(i)) best = Math.min(best, pointSegDist(p, L.nodes[e.a]!, L.nodes[e.b]!));
  });
  return best;
}

function tryMove(L: Layout, g: Graph, n: number, x: number, y: number): boolean {
  const node = L.nodes[n]!, from = { x: node.x, y: node.y }, to = { x, y };
  for (const m of g.nbrs[n]!) {
    const M = L.nodes[m]!;
    for (let q = 0; q < L.nodes.length; q++) {
      if (q !== n && q !== m && inTriangle(L.nodes[q]!, from, to, M)) return false;
    }
  }
  node.x = x;
  node.y = y;
  let ok = true;
  for (const i of g.incident[n]!) {
    for (let j = 0; j < g.es.length && ok; j++) if (j !== i && !edgePairOk(L, g.es[i]!, g.es[j]!)) ok = false;
    if (!ok) break;
  }
  if (ok) {
    for (const m of [n, ...g.nbrs[n]!]) {
      const list = g.passes.get(m);
      if (list && !rotationOk(L, m, list)) {
        ok = false;
        break;
      }
    }
  }
  if (!ok) {
    node.x = from.x;
    node.y = from.y;
  }
  return ok;
}

export function relax(L: Layout, iterations: number = RELAX_ITERATIONS): void {
  const g = graphOf(L);
  for (let it = 0; it < iterations; it++) {
    let moved = 0;
    for (let n = 0; n < L.nodes.length; n++) {
      const node = L.nodes[n]!;
      if (node.fixed) continue;
      const nb = g.nbrs[n]!;
      let bx = 0, by = 0;
      for (const m of nb) {
        bx += L.nodes[m]!.x;
        by += L.nodes[m]!.y;
      }
      let sx = PULL * (bx / nb.length - node.x), sy = PULL * (by / nb.length - node.y);
      for (let q = 0; q < L.nodes.length; q++) {
        if (q === n) continue;
        const Q = L.nodes[q]!, dx = node.x - Q.x, dy = node.y - Q.y, dist = Math.hypot(dx, dy);
        if (dist > 1e-12 && dist < D) {
          sx += (PUSH * dx * (D - dist)) / dist;
          sy += (PUSH * dy * (D - dist)) / dist;
        }
      }
      const len = Math.hypot(sx, sy);
      if (len < 1e-4) continue;
      const room = ROOM * clearance(L, g, n);
      if (len > room) {
        sx *= room / len;
        sy *= room / len;
      }
      if (tryMove(L, g, n, node.x + sx, node.y + sy) || tryMove(L, g, n, node.x + sx / 2, node.y + sy / 2)) moved++;
    }
    if (moved === 0) break;
  }
}
```

Add to `src/realize/index.ts`: `export * from "./relax";`

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- tests/relax.test.ts`
Expected: PASS. A scratch run before the plan was finalized took the median distance from each crossing to its nearest neighbor from 5–8 board units to about 11.5 (4, 7 and 10 ropes), with relaxation taking about 0.15 s, 0.8 s and 1.7 s. Report your numbers; a spatial grid for the edge checks is the follow-up if they are much slower, not part of this task.

- [ ] **Step 5: Full suite, typecheck, lint, commit**

Run: `npm test && npm run typecheck && npm run lint`

```bash
git add src/realize/relax.ts src/realize/index.ts tests/relax.test.ts
git commit -m "feat: spread fitted layouts without changing their topology"
```

---

### Task 7: Place, inflate and compare

**Files:**
- Create: `src/realize/place.ts`, `src/realize/compare.ts`, `src/realize/realize.ts`
- Modify: `src/realize/index.ts` (add the three exports)
- Test: `tests/realize.test.ts`

**Interfaces:**
- Consumes: Tasks 2, 5, 6; `pairSequence`, `cyclicOrder`, `Label` (plan 1); `mulberry32`.
- Produces:
```ts
export const RAMP = 150;
export function chainPoints(L: Layout, rope: number): P3[];
export interface PlaceOptions { zTension: boolean; monitor: Monitor | null }
export function placeAndInflate(L: Layout, board: Board, holes: number[], opts: PlaceOptions): Engine;
export function reduceLabels(seq: readonly Label[]): Label[];
export function physicalSequence(sig: Signature, a: number, b: number): Label[];
export interface PairComparison { a: number; b: number; diagram: Label[]; physical: Label[]; ok: boolean }
export interface Agreement { ok: boolean; orderOk: boolean; pairs: PairComparison[] }
export function compare(d: Diagram, E: Engine): Agreement;
export interface RealizeOptions { zTension?: boolean; relaxIterations?: number; monitor?: boolean }
export interface Realized { engine: Engine; holes: number[]; layout: Layout; agreement: Agreement; inflationFlags: number }
export function fitSeed(seed: number): number;
export function realize(d: Diagram, board: Board, seed: number, opts?: RealizeOptions): Realized;
```
- Engine rope `i` is diagram rope `i`, with particle 0 at diagram end 0, so physical sequences read along the same rope in the same direction as `pairSequence`.

- [ ] **Step 1: Write the failing test**

`tests/realize.test.ts`:
```ts
import { boardForRopes } from "../src/board";
import { cloneDiagram, createDiagram, type Diagram } from "../src/diagram";
import { D } from "../src/engine/constants";
import { compare, reduceLabels } from "../src/realize/compare";
import { assignHoles, buildLayout } from "../src/realize/fit";
import { chainPoints } from "../src/realize/place";
import { realize } from "../src/realize/realize";
import { cross, hook } from "../src/recipes";
import { mulberry32 } from "../src/util/rng";

function hooked(): Diagram {
  const d = createDiagram(4);
  cross.apply(d, 0, 1, 1);
  hook.apply(d, 1, 0, 0);
  return d;
}

describe("reduceLabels", () => {
  it("cancels adjacent equal labels until none remain", () => {
    expect(reduceLabels(["over", "over"])).toEqual([]);
    expect(reduceLabels(["under", "over", "over", "under"])).toEqual([]);
    expect(reduceLabels(["over", "under", "under", "under"])).toEqual(["over", "under"]);
  });
});

describe("chainPoints", () => {
  it("spaces particles at most H0 apart with crossings at half the contact distance", () => {
    const d = hooked(), board = boardForRopes(4);
    const L = buildLayout(d, board, assignHoles(d, board, mulberry32(1)));
    for (let rope = 0; rope < 4; rope++) {
      const pts = chainPoints(L, rope);
      expect(pts[0]!.z).toBe(0);
      expect(pts[pts.length - 1]!.z).toBe(0);
      for (let i = 1; i < pts.length; i++) {
        expect(Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y)).toBeLessThanOrEqual(8 + 1e-9);
      }
      for (const p of pts) expect(Math.abs(p.z)).toBeLessThanOrEqual(D / 2);
    }
    const z1 = chainPoints(L, 1).map((p) => p.z);
    expect(Math.max(...z1)).toBe(D / 2);
    expect(Math.min(...z1)).toBe(-D / 2);
  });
});

describe("realize", () => {
  it("realizes a hook so that the physics agrees with the diagram", () => {
    const r = realize(hooked(), boardForRopes(4), 1);
    expect(r.agreement.orderOk).toBe(true);
    expect(r.agreement.ok).toBe(true);
    const pair = r.agreement.pairs.find((p) => p.a === 0 && p.b === 1)!;
    expect(reduceLabels(pair.diagram)).toHaveLength(2);
    expect(reduceLabels(pair.physical)).toEqual(reduceLabels(pair.diagram));
  });

  it("leaves every end at rest in its assigned hole", () => {
    const r = realize(hooked(), boardForRopes(4), 3);
    r.engine.ropes.forEach((rope, i) => {
      for (const end of [0, 1] as const) {
        const hole = r.engine.hole(r.holes[i * 2 + end]!);
        expect(rope.ends[end]).toBe(r.holes[i * 2 + end]);
        expect(r.engine.endPoint(i, end)).toMatchObject({ x: hole.x, y: hole.y, z: 0 });
      }
    });
  });

  it("reports a disagreement when the diagram is mirrored", () => {
    const d = hooked();
    const r = realize(d, boardForRopes(4), 1);
    const m = cloneDiagram(d);
    for (const c of m.crossings.values()) if (c.a !== c.b) c.over = c.over === c.a ? c.b : c.a;
    for (const rope of m.ropes) for (const v of rope.vertices) if (v.kind === "crossing") v.overHere = !v.overHere;
    expect(compare(m, r.engine).ok).toBe(false);
  });

  it("is deterministic", () => {
    const a = realize(hooked(), boardForRopes(4), 5), b = realize(hooked(), boardForRopes(4), 5);
    expect(a.engine.ropes.map((r) => r.pts)).toEqual(b.engine.ropes.map((r) => r.pts));
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- tests/realize.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`src/realize/place.ts`:
```ts
import type { Board } from "../board";
import { D, H0 } from "../engine/constants";
import { Engine } from "../engine/engine";
import type { Monitor } from "../engine/monitor";
import { settle } from "../engine/settle";
import type { P3 } from "../engine/types";
import type { Layout } from "./layout";

export const RAMP = 150;

export interface PlaceOptions {
  zTension: boolean;
  monitor: Monitor | null;
}

export function chainPoints(L: Layout, rope: number): P3[] {
  const r = L.ropes[rope];
  if (!r) throw new Error(`chainPoints: no rope ${rope}`);
  const pts: P3[] = [], keys: { i: number; z: number }[] = [];
  const last = r.nodes.length - 1;
  for (let k = 0; k <= last; k++) {
    const P = L.nodes[r.nodes[k]!]!;
    if (k > 0) {
      const Q = L.nodes[r.nodes[k - 1]!]!;
      const n = Math.ceil(Math.hypot(P.x - Q.x, P.y - Q.y) / H0);
      for (let j = 1; j < n; j++) pts.push({ x: Q.x + ((P.x - Q.x) * j) / n, y: Q.y + ((P.y - Q.y) * j) / n, z: 0 });
    }
    const label = r.labels[k] ?? null;
    if (k === 0 || k === last) keys.push({ i: pts.length, z: 0 });
    else if (label !== null) keys.push({ i: pts.length, z: label ? D / 2 : -D / 2 });
    pts.push({ x: P.x, y: P.y, z: 0 });
  }
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y));
  for (let q = 0; q + 1 < keys.length; q++) {
    const A = keys[q]!, B = keys[q + 1]!, span = s[B.i]! - s[A.i]!;
    for (let i = A.i; i <= B.i; i++) pts[i]!.z = span > 0 ? A.z + ((B.z - A.z) * (s[i]! - s[A.i]!)) / span : A.z;
  }
  return pts;
}

export function placeAndInflate(L: Layout, board: Board, holes: number[], opts: PlaceOptions): Engine {
  const E = new Engine(board);
  E.contactD = 0;
  E.resampleOn = false;
  E.zTension = opts.zTension;
  L.ropes.forEach((_, i) => E.addRope(chainPoints(L, i), [holes[i * 2]!, holes[i * 2 + 1]!]));
  E.monitor = opts.monitor;
  for (let i = 1; i <= RAMP; i++) {
    E.contactD = (D * i) / RAMP;
    E.substep(null);
  }
  E.zTension = true;
  E.resampleOn = true;
  E.minDist = Infinity;
  settle(E, 800, 0.15);
  E.monitor = null;
  return E;
}
```

`src/realize/compare.ts`:
```ts
import { cyclicOrder, pairSequence, type Diagram, type Label } from "../diagram";
import type { Engine } from "../engine/engine";
import { pairKey, type Signature } from "../engine/types";

export interface PairComparison {
  a: number;
  b: number;
  diagram: Label[];
  physical: Label[];
  ok: boolean;
}

export interface Agreement {
  ok: boolean;
  orderOk: boolean;
  pairs: PairComparison[];
}

export function reduceLabels(seq: readonly Label[]): Label[] {
  const out: Label[] = [];
  for (const l of seq) {
    if (out[out.length - 1] === l) out.pop();
    else out.push(l);
  }
  return out;
}

export function physicalSequence(sig: Signature, a: number, b: number): Label[] {
  const arr = sig.get(pairKey(a, b)) ?? [];
  const along = a < b ? arr : arr.slice().sort((p, q) => p.ub - q.ub);
  return along.map((c) => (c.over === a ? "over" : "under"));
}

function endOrderOk(d: Diagram, E: Engine): boolean {
  const diag = cyclicOrder(d).map((e) => e.rope * 2 + e.end);
  const phys: { key: number; rim: number }[] = [];
  for (const r of E.ropes) {
    for (const end of [0, 1] as const) {
      const h = r.ends[end];
      if (h === null) return false;
      phys.push({ key: r.id * 2 + end, rim: E.hole(h).rim });
    }
  }
  const keys = phys.sort((p, q) => p.rim - q.rim).map((p) => p.key);
  const start = keys.indexOf(diag[0]!);
  return start >= 0 && diag.every((k, i) => keys[(start + i) % keys.length] === k);
}

export function compare(d: Diagram, E: Engine): Agreement {
  const sig = E.signature();
  const pairs: PairComparison[] = [];
  for (let a = 0; a < d.ropes.length; a++) {
    for (let b = a + 1; b < d.ropes.length; b++) {
      const diagram = pairSequence(d, a, b), physical = physicalSequence(sig, a, b);
      const rd = reduceLabels(diagram), rp = reduceLabels(physical);
      pairs.push({ a, b, diagram, physical, ok: rd.length === rp.length && rd.every((l, i) => l === rp[i]) });
    }
  }
  const orderOk = endOrderOk(d, E);
  return { ok: orderOk && pairs.every((p) => p.ok), orderOk, pairs };
}
```

`src/realize/realize.ts`:
```ts
import type { Board } from "../board";
import type { Diagram } from "../diagram";
import type { Engine } from "../engine/engine";
import { Monitor } from "../engine/monitor";
import { mulberry32 } from "../util/rng";
import { compare, type Agreement } from "./compare";
import { assignHoles, buildLayout } from "./fit";
import type { Layout } from "./layout";
import { placeAndInflate } from "./place";
import { relax, RELAX_ITERATIONS } from "./relax";

export interface RealizeOptions {
  zTension?: boolean;
  relaxIterations?: number;
  monitor?: boolean;
}

export interface Realized {
  engine: Engine;
  holes: number[];
  layout: Layout;
  agreement: Agreement;
  inflationFlags: number;
}

export function fitSeed(seed: number): number {
  return (seed ^ 0x5bd1e995) >>> 0;
}

export function realize(d: Diagram, board: Board, seed: number, opts: RealizeOptions = {}): Realized {
  const holes = assignHoles(d, board, mulberry32(fitSeed(seed)));
  const layout = buildLayout(d, board, holes);
  relax(layout, opts.relaxIterations ?? RELAX_ITERATIONS);
  const monitor = opts.monitor ? new Monitor() : null;
  const engine = placeAndInflate(layout, board, holes, { zTension: opts.zTension ?? true, monitor });
  return { engine, holes, layout, agreement: compare(d, engine), inflationFlags: monitor?.count ?? 0 };
}
```

Add to `src/realize/index.ts`:
```ts
export * from "./place";
export * from "./compare";
export * from "./realize";
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- tests/realize.test.ts`
Expected: PASS. If the hook disagrees, rerun `realize` with `{ monitor: true }` and look at `inflationFlags` and the monitor log: flags during the ramp mean heights lost their order before contacts grew (try `zTension: false` once and report both results), no flags but a wrong final sequence means a comparison or orientation bug.

- [ ] **Step 5: Full suite, typecheck, lint, commit**

Run: `npm test && npm run typecheck && npm run lint`

```bash
git add src/realize tests/realize.test.ts
git commit -m "feat: place, inflate and compare realized boards"
```

---

### Task 8: Board generation and debug dumps

**Files:**
- Create: `src/generate/dump.ts`, `src/generate/generate.ts`
- Modify: `vite.config.ts` (define `__APP_VERSION__`), `src/vite-env.d.ts` (declare it)
- Test: `tests/generate.test.ts`

**Interfaces:**
- Consumes: `scramble`, `scrambleWithRetry`, `defaultDifficulty`, `ScrambleLogEntry`, `Difficulty`, `Scrambled` (plan 1); `deck` (plan 1); `realize`, `Realized`, `RealizeOptions`, `Agreement`, `RealizeFailed` (Tasks 5, 7); `ENGINE_CONSTANTS`, `PhysCrossing`, `Signature` (Task 2); `boardForRopes` (Task 1).
- Produces:
```ts
export interface DiagramJson { ropes: RopeD[]; crossings: Crossing[]; ends: EndPos[]; nextCrossingId: number }
export function diagramToJson(d: Diagram): DiagramJson;
export function diagramFromJson(j: DiagramJson): Diagram;
export function flatSignature(sig: Signature): PhysCrossing[];
export interface DumpInput { seed; ropes; difficulty; log; diagram: DiagramJson; holes: number[]; stage: "fit" | "physics"; error: string | null; signature: PhysCrossing[]; comparison: Agreement | null }
export interface DebugDump extends DumpInput { kind: "rope-tangle-debug"; app: string; deck: string[]; constants: Record<string, number> }
export function makeDump(input: DumpInput): string;
export function parseDump(text: string): DebugDump;
export interface GenerateOptions extends RealizeOptions { maxTries?: number; realizeImpl?: typeof realize }
export interface Generated { engine: Engine; seed: number; scrambled: Scrambled; realized: Realized; dumps: string[]; tries: number }
export function generateBoard(seed: number, ropes: number, opts?: GenerateOptions): Generated;
```

- [ ] **Step 1: Write the failing test**

`tests/generate.test.ts`:
```ts
import { boardForRopes } from "../src/board";
import { diagramFromJson, diagramToJson, flatSignature, makeDump, parseDump } from "../src/generate/dump";
import { generateBoard } from "../src/generate/generate";
import { RealizeFailed } from "../src/realize/errors";
import { realize } from "../src/realize/realize";
import { defaultDifficulty, scramble, scrambleWithRetry } from "../src/scramble/scramble";

describe("debug dump", () => {
  it("round-trips and carries what is needed to reproduce the board", () => {
    const s = scrambleWithRetry(7, 4);
    const board = boardForRopes(4);
    const r = realize(s.diagram, board, s.seed);
    const text = makeDump({
      seed: s.seed, ropes: 4, difficulty: defaultDifficulty(4), log: s.log, diagram: diagramToJson(s.diagram),
      holes: r.holes, stage: "physics", error: null, signature: flatSignature(r.engine.signature()), comparison: r.agreement,
    });
    const dump = parseDump(text);
    expect(dump.kind).toBe("rope-tangle-debug");
    expect(dump.deck).toEqual(["cross:1", "hook:3", "twist2:1", "twist3:0.5"]);
    expect(dump.constants["D"]).toBe(16);
    expect(diagramToJson(scramble(dump.seed, dump.ropes, dump.difficulty).diagram)).toEqual(dump.diagram);
    const again = realize(diagramFromJson(dump.diagram), board, dump.seed);
    expect(flatSignature(again.engine.signature())).toEqual(dump.signature);
  });

  it("rejects text that is not a dump", () => {
    expect(() => parseDump("{\"kind\":\"other\"}")).toThrow();
  });
});

describe("generateBoard", () => {
  it("generates an agreeing 4-rope board", () => {
    const g = generateBoard(1, 4);
    expect(g.realized.agreement.ok).toBe(true);
    expect(g.engine.ropes).toHaveLength(4);
  });

  it("keeps a dump and moves to the next seed when physics disagrees", () => {
    let calls = 0;
    const flaky: typeof realize = (d, board, seed, opts) => {
      const r = realize(d, board, seed, opts);
      calls++;
      return calls === 1 ? { ...r, agreement: { ...r.agreement, ok: false } } : r;
    };
    const g = generateBoard(11, 4, { realizeImpl: flaky });
    expect(g.tries).toBe(2);
    expect(g.dumps).toHaveLength(1);
    const dump = parseDump(g.dumps[0]!);
    expect(dump.stage).toBe("physics");
    expect(dump.seed).toBeLessThan(g.seed);
  });

  it("records a fit failure as a dump", () => {
    let calls = 0;
    const failsOnce: typeof realize = (d, board, seed, opts) => {
      if (calls++ === 0) throw new RealizeFailed("fit: test");
      return realize(d, board, seed, opts);
    };
    const g = generateBoard(3, 4, { realizeImpl: failsOnce });
    const dump = parseDump(g.dumps[0]!);
    expect(dump.stage).toBe("fit");
    expect(dump.error).toBe("fit: test");
    expect(dump.signature).toEqual([]);
  });

  it("gives up after maxTries", () => {
    const always: typeof realize = () => {
      throw new RealizeFailed("fit: always");
    };
    expect(() => generateBoard(1, 4, { maxTries: 2, realizeImpl: always })).toThrow(RealizeFailed);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- tests/generate.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

In `vite.config.ts`, add to the `defineConfig` object (next to `base`):
```ts
  define: {
    __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? "dev"),
  },
```

Append to `src/vite-env.d.ts`:
```ts
declare const __APP_VERSION__: string;
```

`src/generate/dump.ts`:
```ts
import type { Crossing, Diagram, EndPos, RopeD } from "../diagram";
import { ENGINE_CONSTANTS } from "../engine/constants";
import type { PhysCrossing, Signature } from "../engine/types";
import type { Agreement } from "../realize/compare";
import { deck } from "../recipes/deck";
import type { Difficulty, ScrambleLogEntry } from "../scramble/scramble";

export interface DiagramJson {
  ropes: RopeD[];
  crossings: Crossing[];
  ends: EndPos[];
  nextCrossingId: number;
}

export function diagramToJson(d: Diagram): DiagramJson {
  return { ropes: d.ropes, crossings: [...d.crossings.values()], ends: d.ends, nextCrossingId: d.nextCrossingId };
}

export function diagramFromJson(j: DiagramJson): Diagram {
  return { ropes: j.ropes, crossings: new Map(j.crossings.map((c) => [c.id, c])), ends: j.ends, nextCrossingId: j.nextCrossingId };
}

export function flatSignature(sig: Signature): PhysCrossing[] {
  return [...sig.values()].flat();
}

export interface DumpInput {
  seed: number;
  ropes: number;
  difficulty: Difficulty;
  log: ScrambleLogEntry[];
  diagram: DiagramJson;
  holes: number[];
  stage: "fit" | "physics";
  error: string | null;
  signature: PhysCrossing[];
  comparison: Agreement | null;
}

export interface DebugDump extends DumpInput {
  kind: "rope-tangle-debug";
  app: string;
  deck: string[];
  constants: Record<string, number>;
}

export function makeDump(input: DumpInput): string {
  const dump: DebugDump = {
    kind: "rope-tangle-debug",
    app: __APP_VERSION__,
    deck: deck.map((r) => `${r.name}:${r.weight}`),
    constants: { ...ENGINE_CONSTANTS },
    ...input,
  };
  return JSON.stringify(dump);
}

function isDump(v: unknown): v is DebugDump {
  return typeof v === "object" && v !== null && "kind" in v && v.kind === "rope-tangle-debug";
}

export function parseDump(text: string): DebugDump {
  const v: unknown = JSON.parse(text);
  if (!isDump(v)) throw new Error("not a rope-tangle debug dump");
  return v;
}
```

`src/generate/generate.ts`:
```ts
import { boardForRopes } from "../board";
import type { Engine } from "../engine/engine";
import { RealizeFailed } from "../realize/errors";
import { realize, type RealizeOptions, type Realized } from "../realize/realize";
import { defaultDifficulty, scrambleWithRetry, type Scrambled } from "../scramble/scramble";
import { diagramToJson, flatSignature, makeDump } from "./dump";

export interface GenerateOptions extends RealizeOptions {
  maxTries?: number;
  realizeImpl?: typeof realize;
}

export interface Generated {
  engine: Engine;
  seed: number;
  scrambled: Scrambled;
  realized: Realized;
  dumps: string[];
  tries: number;
}

export function generateBoard(seed: number, ropes: number, opts: GenerateOptions = {}): Generated {
  const board = boardForRopes(ropes), difficulty = defaultDifficulty(ropes);
  const maxTries = opts.maxTries ?? 10, run = opts.realizeImpl ?? realize;
  const dumps: string[] = [];
  let next = seed;
  for (let tries = 1; tries <= maxTries; tries++) {
    const s = scrambleWithRetry(next, ropes, difficulty);
    let realized: Realized | null = null, error: string | null = null;
    try {
      realized = run(s.diagram, board, s.seed, opts);
    } catch (e) {
      if (!(e instanceof RealizeFailed)) throw e;
      error = e.message;
    }
    if (realized && realized.agreement.ok) {
      return { engine: realized.engine, seed: s.seed, scrambled: s, realized, dumps, tries };
    }
    dumps.push(makeDump({
      seed: s.seed,
      ropes,
      difficulty,
      log: s.log,
      diagram: diagramToJson(s.diagram),
      holes: realized?.holes ?? [],
      stage: realized ? "physics" : "fit",
      error,
      signature: realized ? flatSignature(realized.engine.signature()) : [],
      comparison: realized?.agreement ?? null,
    }));
    next = s.seed + 1;
  }
  throw new RealizeFailed(`no agreeing board in ${maxTries} tries from seed ${seed}`);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- tests/generate.test.ts`
Expected: PASS. The reproduce test is the spec §11 requirement "a disagreement produces a dump that reproduces the case": it proves the dump alone rebuilds the same diagram and the same physical signature.

- [ ] **Step 5: Full suite, typecheck, lint, commit**

Run: `npm test && npm run typecheck && npm run lint`

```bash
git add src/generate vite.config.ts src/vite-env.d.ts tests/generate.test.ts
git commit -m "feat: generate boards with retry and debug dumps"
```

---

### Task 9: Rope rendering and the dev page

**Files:**
- Create: `src/render/ropes.ts`
- Modify: `src/main.ts`, `index.html`

**Interfaces:**
- Consumes: `Engine`, `ERope`, `PEG_R`, `W` (Task 2); `generateBoard` (Task 8); `drawDiagram` (plan 1).
- Produces:
```ts
export const ROPE_COLORS: readonly string[];
export interface View { s: number; ox: number; oy: number }
export function fitView(board: Board, width: number, height: number): View;
export function drawBoard(ctx: CanvasRenderingContext2D, E: Engine, colors: readonly string[], view: View, dpr: number): void;
```
- Painter's order per spec §10.5: each rope is cut into pieces at its particles, pieces sorted by rounded height, consecutive pieces of one rope at the same height merged into one stroke, extended 0.75 units at the ends; outline `W + 3` in `#1d2230` under the colored `W` stroke. Holes are pale discs; holes with an end are discs in the rope's color with an outline.

- [ ] **Step 1: Implement the renderer**

`src/render/ropes.ts`:
```ts
import type { Board } from "../board";
import { PEG_R, W } from "../engine/constants";
import type { Engine } from "../engine/engine";
import type { ERope } from "../engine/types";

export const ROPE_COLORS: readonly string[] = [
  "#2e9e3a", "#2f7fe0", "#e0453a", "#f0a020", "#8e44d0", "#18b3b3", "#e05fa8", "#8a5a33", "#b8a800", "#5c6b7a",
];

const OUTLINE = "#1d2230";
const BACKGROUND = "#eef1f8";
const EMPTY_HOLE = "#d6dbee";
const EXT = 0.75;

export interface View {
  s: number;
  ox: number;
  oy: number;
}

export function fitView(board: Board, width: number, height: number): View {
  const m = PEG_R + 10, bw = board.width + 2 * m, bh = board.height + 2 * m;
  const s = Math.min(width / bw, height / bh);
  return { s, ox: (width - bw * s) / 2 + m * s, oy: (height - bh * s) / 2 + m * s };
}

const colorOf = (colors: readonly string[], id: number): string => colors[id % colors.length] ?? OUTLINE;

function runPath(ctx: CanvasRenderingContext2D, r: ERope, k0: number, k1: number): void {
  const p = r.pts, n = p.length;
  ctx.beginPath();
  if (k0 === 0) ctx.moveTo(p[0]!.x, p[0]!.y);
  else {
    const a = p[k0 - 1]!, b = p[k0]!, l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    ctx.moveTo((a.x + b.x) / 2 - ((b.x - a.x) / l) * EXT, (a.y + b.y) / 2 - ((b.y - a.y) / l) * EXT);
  }
  for (let k = k0; k <= k1; k++) ctx.lineTo(p[k]!.x, p[k]!.y);
  if (k1 < n - 1) {
    const a = p[k1]!, b = p[k1 + 1]!, l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    ctx.lineTo((a.x + b.x) / 2 + ((b.x - a.x) / l) * EXT, (a.y + b.y) / 2 + ((b.y - a.y) / l) * EXT);
  }
}

function drawRopes(ctx: CanvasRenderingContext2D, list: readonly ERope[], colors: readonly string[]): void {
  const pieces: { r: ERope; k: number; z: number }[] = [];
  for (const r of list) r.pts.forEach((p, k) => pieces.push({ r, k, z: Math.round(p.z) }));
  pieces.sort((a, b) => a.z - b.z || a.r.id - b.r.id || a.k - b.k);
  ctx.lineCap = "butt";
  ctx.lineJoin = "round";
  let i = 0;
  while (i < pieces.length) {
    const first = pieces[i]!;
    let j = i;
    while (j + 1 < pieces.length && pieces[j + 1]!.r === first.r && pieces[j + 1]!.z === first.z && pieces[j + 1]!.k === pieces[j]!.k + 1) j++;
    runPath(ctx, first.r, first.k, pieces[j]!.k);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = W + 3;
    ctx.stroke();
    ctx.strokeStyle = colorOf(colors, first.r.id);
    ctx.lineWidth = W;
    ctx.stroke();
    i = j + 1;
  }
}

export function drawBoard(ctx: CanvasRenderingContext2D, E: Engine, colors: readonly string[], view: View, dpr: number): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, ctx.canvas.width / dpr, ctx.canvas.height / dpr);
  ctx.setTransform(dpr * view.s, 0, 0, dpr * view.s, dpr * view.ox, dpr * view.oy);
  const owner = new Map<number, number>();
  for (const r of E.active()) for (const h of r.ends) if (h !== null) owner.set(h, r.id);
  E.board.holes.forEach((P, i) => {
    ctx.beginPath();
    ctx.arc(P.x, P.y, PEG_R, 0, Math.PI * 2);
    const o = owner.get(i);
    if (o === undefined) {
      ctx.fillStyle = EMPTY_HOLE;
      ctx.fill();
    } else {
      ctx.fillStyle = colorOf(colors, o);
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
    }
  });
  const act = E.active();
  drawRopes(ctx, act, colors);
  for (const r of act) {
    for (const p of [r.pts[0]!, r.pts[r.pts.length - 1]!]) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, W * 0.75, 0, Math.PI * 2);
      ctx.fillStyle = colorOf(colors, r.id);
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
    }
  }
}
```

- [ ] **Step 2: Rewrite the dev page**

`index.html` body (replace the current body):
```html
  <body style="margin:0;font:14px system-ui;background:#eef1f8">
    <div id="info" style="padding:8px"></div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;padding:0 8px">
      <canvas id="diagram"></canvas>
      <canvas id="board"></canvas>
    </div>
    <textarea id="dump" readonly style="display:none;width:95%;height:160px;margin:8px"></textarea>
    <script type="module" src="/src/main.ts"></script>
  </body>
```

`src/main.ts`:
```ts
import { drawDiagram } from "./devpage/draw";
import { generateBoard } from "./generate/generate";
import { drawBoard, fitView, ROPE_COLORS } from "./render/ropes";

const q = new URLSearchParams(location.search);
const seed = Math.max(1, Number(q.get("seed") ?? 1) || 1);
const ropes = Math.min(10, Math.max(4, Number(q.get("ropes") ?? 5) || 5));

const t0 = performance.now();
const g = generateBoard(seed, ropes, { monitor: true });
const ms = performance.now() - t0;

const canvasById = (id: string): HTMLCanvasElement => {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLCanvasElement)) throw new Error(`dev page: missing #${id}`);
  return el;
};
const context = (c: HTMLCanvasElement): CanvasRenderingContext2D => {
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("dev page: no 2d context");
  return ctx;
};

const size = Math.max(200, Math.min(innerWidth / 2 - 16, innerHeight - 120));
const dpr = Math.min(devicePixelRatio || 1, 2);

const dc = canvasById("diagram");
dc.width = size;
dc.height = size;
drawDiagram(context(dc), g.scrambled.diagram, size);

const bc = canvasById("board");
bc.width = size * dpr;
bc.height = size * dpr;
bc.style.width = `${size}px`;
bc.style.height = `${size}px`;
drawBoard(context(bc), g.engine, ROPE_COLORS, fitView(g.engine.board, size, size), dpr);

let physical = 0;
for (const arr of g.engine.signature().values()) physical += arr.length;
const info = document.getElementById("info");
if (info) {
  info.innerHTML =
    `seed ${g.seed} · ${ropes} ropes · ${g.scrambled.log.length} recipes · diagram ${g.scrambled.diagram.crossings.size} crossings · ` +
    `physics ${physical} · tries ${g.tries} · ${ms.toFixed(0)} ms · inflation flags ${g.realized.inflationFlags} ` +
    `<a href="?seed=${g.seed - 1}&ropes=${ropes}">prev</a> <a href="?seed=${g.seed + 1}&ropes=${ropes}">next</a>`;
}
const dump = document.getElementById("dump");
if (dump instanceof HTMLTextAreaElement && g.dumps.length > 0) {
  dump.style.display = "block";
  dump.value = g.dumps.join("\n\n");
}
```

- [ ] **Step 3: Typecheck, lint, build**

Run: `npm run typecheck && npm run lint && npm run build`
Expected: all green.

- [ ] **Step 4: Look at it**

Run `npm run preview -- --port 4719 --strictPort` in the background and open `http://localhost:4719/rope-tangle/?seed=1&ropes=5`, then `ropes=8` and `ropes=10` (Playwright screenshots are fine). Expected: the realized board shows the same tangle as the diagram on its left (same colors per rope), ropes are drawn over and under each other, ends sit in holes, no console errors besides a missing favicon. Walk `next` five times at 8 ropes. Record generation times and any non-empty dump box in the report. Stop the server.

- [ ] **Step 5: Commit**

```bash
git add src/render src/main.ts index.html
git commit -m "feat: draw realized boards on the dev page"
```

---

### Task 10: Measure agreement and report

**Files:**
- Create: `tests/measure/realize.measure.test.ts`, `docs/superpowers/notes/2026-10-09-realize-measurements.md`
- Modify: `vite.config.ts` (exclude measure files unless `MEASURE` is set), `package.json` (add the `measure` script)

**Interfaces:**
- Consumes: `realize`, `RealizeFailed`, `scrambleWithRetry`, `boardForRopes`, `Layout`.
- Produces: the measurement table the spec asks for (§11: "agreement rate over many seeds per rope count"), and a decision on z-tension during the ramp.

- [ ] **Step 1: Wire the measurement run**

In `vite.config.ts`, replace the `exclude` line with:
```ts
    exclude: [
      "**/node_modules/**", "**/dist/**", "**/spike/**", "**/.worktrees/**", "**/.claude/**",
      ...(process.env.MEASURE ? [] : ["**/*.measure.test.ts"]),
    ],
```

In `package.json` scripts add:
```json
    "measure": "MEASURE=1 vitest run tests/measure"
```

`tests/measure/realize.measure.test.ts`:
```ts
import { boardForRopes } from "../../src/board";
import { RealizeFailed } from "../../src/realize/errors";
import type { Layout } from "../../src/realize/layout";
import { realize } from "../../src/realize/realize";
import { scrambleWithRetry } from "../../src/scramble/scramble";

const SEEDS = Number(import.meta.env["SEEDS"] ?? 20);

function medianNearestCrossing(L: Layout): number {
  const ids = new Set<number>();
  L.ropes.forEach((r) => r.labels.forEach((l, k) => {
    if (l !== null) ids.add(r.nodes[k]!);
  }));
  const pts = [...ids].map((i) => L.nodes[i]!);
  if (pts.length < 2) return Number.NaN;
  const near = pts.map((p, i) => Math.min(...pts.filter((_, j) => j !== i).map((q) => Math.hypot(p.x - q.x, p.y - q.y))));
  near.sort((a, b) => a - b);
  return near[Math.floor(near.length / 2)]!;
}

describe("realize measurements", () => {
  for (const zTension of [true, false]) {
    it(`agreement per rope count, z-tension during the ramp ${zTension ? "on" : "off"}`, () => {
      const rows: Record<string, string | number>[] = [];
      for (let n = 4; n <= 10; n++) {
        const board = boardForRopes(n);
        let agree = 0, fitFail = 0, flags = 0, ms = 0, subMs = 0, spread = 0, realized = 0;
        for (let k = 1; k <= SEEDS; k++) {
          const s = scrambleWithRetry(k * 1000, n);
          const t0 = performance.now();
          try {
            const r = realize(s.diagram, board, s.seed, { zTension, monitor: true });
            ms += performance.now() - t0;
            realized++;
            if (r.agreement.ok) agree++;
            flags += r.inflationFlags;
            spread += medianNearestCrossing(r.layout);
            const t1 = performance.now();
            for (let i = 0; i < 100; i++) r.engine.substep(null);
            subMs += (performance.now() - t1) / 100;
          } catch (e) {
            if (!(e instanceof RealizeFailed)) throw e;
            fitFail++;
          }
        }
        const per = (v: number) => (realized > 0 ? v / realized : Number.NaN);
        rows.push({
          ropes: n,
          agree: `${agree}/${SEEDS}`,
          fitFail,
          flagsPerBoard: +per(flags).toFixed(2),
          spreadMedian: +per(spread).toFixed(1),
          msPerBoard: Math.round(per(ms)),
          msPerSubstep: +per(subMs).toFixed(3),
        });
      }
      console.table(rows);
    }, 3_600_000);
  }
});
```

- [ ] **Step 2: Run it**

Run: `SEEDS=20 npm run measure`
Expected: two tables (z-tension on and off), each with one row per rope count 4–10. `msPerBoard` includes the monitor, so it overstates game generation time; `msPerSubstep` is the §8.5 benchmark.

Run: `npm test` and confirm the measure file is not part of the normal suite.

- [ ] **Step 3: Record and decide**

Write `docs/superpowers/notes/2026-10-09-realize-measurements.md` with both tables, the machine, and these decisions:

1. **z-tension.** If the "off" table agrees on more boards in total, change the default in `src/realize/realize.ts` to `opts.zTension ?? false`, rerun `npm test`, and update spec §9.2 step 3 to say z-tension is off during the ramp. Otherwise keep it on and say so in the notes and the spec.
2. **Agreement.** If every rope count agrees on at least 19 of 20 boards with the chosen setting, the fast path is ready for plan 3. If not, collect three disagreeing dumps (from `generateBoard` with the failing seeds, or the dev page's dump box) into the notes file and report: do not tune engine constants or the spreading pass in this task. The spec makes a disagreement a bug to understand, not a parameter to fiddle.
3. **Time.** Record `msPerBoard` without the monitor for 10 ropes by rerunning one seed with `monitor: false` in a scratch test (delete it after). Spec §10.6 puts generation in a worker, so seconds are acceptable; more than 5 s at 10 ropes goes in the notes as a follow-up.

- [ ] **Step 4: Full suite, typecheck, lint, commit**

Run: `npm test && npm run typecheck && npm run lint`

```bash
git add tests/measure vite.config.ts package.json docs/superpowers/notes src/realize/realize.ts docs/superpowers/specs/2026-10-08-rope-tangle-design.md
git commit -m "test: measure how often realized boards agree with their diagrams"
```

---

## Self-review notes

- **Spec coverage.** §5 board (Task 1); §8.1–8.3 engine model, ends and pegs (Tasks 2–3); §8.4 signature and monitor (Tasks 2, 4); §8.5 benchmark (Task 10, not asserted); §9.1 holes, disc extensions and spread (Tasks 5–6); §9.2 place and inflate (Task 7); §9.3 comparison (Task 7) and dump (Task 8); §10.5 rendering (Task 9, the subset needed to look at boards); §11 engine battery, monitor sanity, realize agreement and dump reproduction (Tasks 4, 7, 8, 10). Not here by design: input, phases, clearing in play, fade, handles and tether, worker, settings, PWA, deploy (plan 3). §9.3's "same set of hooked pairs" follows from equal reduced pair sequences, so it is not checked separately.
- **Known risk.** Whether the spread layouts inflate into agreeing physics is not known until Task 10 runs; Task 7 proves it on a hand-built hook, and the plan's last task reports the measured rate instead of assuming it.
- **Type consistency.** `Layout`, `LRope.labels`, `Agreement`, `Realized`, `Generated`, `DebugDump` and `Signature` keep the same names and fields across Tasks 5–10; engine rope `i` is diagram rope `i` with particle 0 at end 0 throughout.
