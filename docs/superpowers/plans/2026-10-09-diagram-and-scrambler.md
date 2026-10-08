# Rope Tangle — Plan 1: Diagram, recipes and scrambler

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pure-TypeScript library that scrambles a set of ropes into an exact abstract tangle (every rope hooked on another), plus the project scaffold and a dev page to look at the result.

**Architecture:** The tangle is a planar diagram on the unit circle: ropes are polylines whose vertices are ends, folds and crossings, each crossing labelled with the rope on top. One operation, `moveEnd`, reproduces what the physical move does (cut back to the last under-crossing, straight segment to the midpoint of a gap in the cyclic order of ends, every intersection becomes an over-crossing). Recipes match combinatorial patterns and call `moveEnd`; the scrambler draws recipes from a weighted deck until every rope is hooked. No physics, no holes, no randomness in geometry.

**Tech Stack:** TypeScript 7 (strict), Vite 8, Vitest 5, oxlint, Node 22. No runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-10-08-rope-tangle-design.md` (sections 4, 6, 7; this plan covers modules `diagram`, `recipes`, `scramble` and the scaffold). Plans 2 (engine + realize) and 3 (game, render, worker, deploy) follow.

## Global Constraints

- Code, identifiers and comments in American English. Add a comment only where the code cannot say it; prefer no comment.
- TypeScript strict with `noUncheckedIndexedAccess`; no `any`; no runtime dependencies.
- Node 22 (`.nvmrc`), npm. Tests run with `npm test` (`vitest run`), types with `npm run typecheck` (`tsc --noEmit`), lint with `npm run lint` (oxlint, type-aware). All three must be clean at every commit.
- Toolchain versions follow the `puzzle` game (the most recently maintained sibling); conventions beyond that are chosen for this game: `src/` for code, `tests/` for tests, 2-space indent, double quotes.
- The existing `spike/` directory and `.github/workflows/deploy.yml` stay untouched; the workflow keeps publishing `spike/` only.
- The diagram module never imports from `board`, `engine` or anything DOM-related; recipes and the scrambler never use randomness except the scrambler's seeded choice among matching recipes (spec §7.3).
- Conventional commit messages, one commit per task step that says "Commit".

## Review Focus

- Gaps that wrap past angle 0 (an end at 350° and the next at 10°): the midpoint must be 0°, not 180°. Pinned in Task 4.
- Moving an end into the gap it already occupies (its own neighbors): must behave like a normal move and, when the lifted stretch has only its own over-crossings, restore the previous tangle. Pinned in Task 6.
- A rope hooked under its own lifted part (self-crossing whose over strand is being lifted): the walk must not stop there, or the rope would be "held down" by nothing. Pinned in Task 6.
- Twist asked for more turns than the geometry allows: `apply` must stop early and still return a consistent diagram and the moves it made. Pinned in Task 9.
- A seed on which no recipe matches or the cap is reached: `scramble` throws `ScrambleFailed`, `scrambleWithRetry` moves to the next seed and reports which seed succeeded. Pinned in Task 10.

---

## File structure

| File | Responsibility |
|---|---|
| `package.json`, `tsconfig.json`, `vite.config.ts`, `.nvmrc`, `.gitignore`, `index.html`, `src/main.ts`, `src/vite-env.d.ts` | Project scaffold; `index.html` + `main.ts` become the dev page in Task 11 |
| `src/util/rng.ts` | Seeded RNG (`mulberry32`) and weighted choice |
| `src/diagram/types.ts` | Diagram data types and the `DiagramDegenerate` error |
| `src/diagram/geometry.ts` | Angles, circle points, segment intersection |
| `src/diagram/order.ts` | Cyclic order of ends, gaps, gap midpoints |
| `src/diagram/queries.ts` | Pair sequences, hooks, crossing counts, alternation |
| `src/diagram/move.ts` | `moveEnd` |
| `src/diagram/create.ts` | `createDiagram`, `cloneDiagram` |
| `src/diagram/index.ts` | Re-exports |
| `src/recipes/types.ts` | `Recipe`, `Move`, `ScrambleLogEntry` |
| `src/recipes/flip.ts` | `flipGap`: the gap that flips parity with a partner rope |
| `src/recipes/cross.ts`, `hook.ts`, `twist.ts` | The three recipes |
| `src/recipes/deck.ts` | The weighted deck |
| `src/scramble/scramble.ts` | `scramble`, `scrambleWithRetry`, `replay`, `ScrambleFailed` |
| `src/devpage/draw.ts` | Draws a diagram on a canvas (dev page only) |
| `tests/*.test.ts` | One test file per source module |

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `.oxlintrc.jsonc`, `.nvmrc`, `.gitignore`, `index.html`, `src/main.ts`, `src/vite-env.d.ts`
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Produces: `npm test`, `npm run typecheck`, `npm run dev`, `npm run build` all work.

- [ ] **Step 1: Create the scaffold files**

`package.json`:
```json
{
  "name": "rope-tangle",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "oxlint": "^1.85.0",
    "oxlint-tsgolint": "~7.0.2003",
    "typescript": "~7.0.2",
    "vite": "^8.3.1",
    "vitest": "^5.0.2"
  }
}
```

Add to `scripts`: `"lint": "oxlint --disable-nested-config -c .oxlintrc.jsonc src tests"`.

`.oxlintrc.jsonc`:
```jsonc
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "options": { "typeAware": true, "reportUnusedDisableDirectives": "error" },
  "ignorePatterns": ["/spike/", "/docs/", "/*.config.ts"],
  "categories": { "correctness": "error", "suspicious": "error" },
  "rules": {
    "no-console": "error",
    "typescript/no-explicit-any": "error",
    "typescript/only-throw-error": "error",
    "unicorn/no-array-sort": "off",
    "unicorn/no-array-reverse": "off",
    "unicorn/consistent-function-scoping": "off"
  },
  "overrides": [{ "files": ["**/*.test.ts"], "rules": { "no-console": "off" } }]
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "erasableSyntaxOnly": true,
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noUncheckedIndexedAccess": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedSideEffectImports": true,
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "types": ["vitest/globals", "vite/client"],
    "skipLibCheck": true
  },
  "include": ["src", "tests"]
}
```

`verbatimModuleSyntax` means type-only imports must use `import type` or inline `type` modifiers; the code in this plan already does.

`vite.config.ts`:
```ts
/// <reference types="vitest" />
import { defineConfig } from "vite";

const BASE_PATH = process.env.VITE_BASE_PATH ?? "/rope-tangle/";

export default defineConfig({
  base: BASE_PATH,
  test: {
    globals: true,
    environment: "node",
    exclude: ["**/node_modules/**", "**/dist/**", "**/spike/**", "**/.worktrees/**"],
  },
});
```

`.nvmrc`: `22`

`.gitignore`:
```
node_modules/
dist/
*.local
.DS_Store
.vite/
coverage/
```

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Rope Tangle</title>
  </head>
  <body>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`src/main.ts`:
```ts
document.body.textContent = "Rope Tangle";
```

`src/vite-env.d.ts`:
```ts
/// <reference types="vite/client" />
```

`tests/smoke.test.ts`:
```ts
describe("tooling", () => {
  it("runs tests", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 2: Install and run everything**

Run: `npm install && npm test && npm run typecheck && npm run lint && npm run build`
Expected: 1 test passes, typecheck and lint clean, `dist/` produced. If oxlint's type-aware mode complains about the version pairing, pin `oxlint-tsgolint` to the version `oxlint` prints in its error.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts .oxlintrc.jsonc .nvmrc .gitignore index.html src tests
git commit -m "chore: scaffold the game project"
```

---

### Task 2: Seeded RNG

**Files:**
- Create: `src/util/rng.ts`
- Test: `tests/rng.test.ts`

**Interfaces:**
- Produces: `type Rng = () => number`, `mulberry32(seed: number): Rng`, `pickWeighted<T>(rng: Rng, items: readonly T[], weight: (item: T) => number): T`.

- [ ] **Step 1: Write the failing tests**

```ts
import { mulberry32, pickWeighted } from "../src/util/rng";

describe("mulberry32", () => {
  it("is deterministic per seed and in [0, 1)", () => {
    const a = mulberry32(42), b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });
});

describe("pickWeighted", () => {
  it("never picks zero-weight items and respects weights roughly", () => {
    const rng = mulberry32(7);
    const counts = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 3000; i++) {
      const k = pickWeighted(rng, ["a", "b", "c"] as const, (x) => ({ a: 3, b: 1, c: 0 })[x]);
      counts[k]++;
    }
    expect(counts.c).toBe(0);
    expect(counts.a).toBeGreaterThan(counts.b * 2);
  });

  it("throws on an empty list or all-zero weights", () => {
    expect(() => pickWeighted(mulberry32(1), [], () => 1)).toThrow();
    expect(() => pickWeighted(mulberry32(1), [1, 2], () => 0)).toThrow();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- tests/rng.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`src/util/rng.ts`:
```ts
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pickWeighted<T>(rng: Rng, items: readonly T[], weight: (item: T) => number): T {
  let total = 0;
  for (const item of items) total += weight(item);
  if (!(total > 0)) throw new Error("pickWeighted: nothing to pick");
  let r = rng() * total;
  for (const item of items) {
    r -= weight(item);
    if (r < 0) return item;
  }
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]!;
    if (weight(item) > 0) return item;
  }
  throw new Error("pickWeighted: nothing to pick");
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- tests/rng.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/util/rng.ts tests/rng.test.ts
git commit -m "feat: add seeded rng and weighted choice"
```

---

### Task 3: Geometry on the unit circle

**Files:**
- Create: `src/diagram/geometry.ts`
- Test: `tests/geometry.test.ts`

**Interfaces:**
- Produces: `TAU`, `normAngle(a: number): number` (into `[0, TAU)`), `circlePoint(angle: number): Point`, `interface Point { x: number; y: number }`, `intersect(p1, p2, p3, p4): IntersectResult` where `IntersectResult = { kind: "none" } | { kind: "degenerate" } | { kind: "hit"; t: number; u: number; x: number; y: number }` (`t` along p1→p2, `u` along p3→p4, both strictly inside `(0, 1)`).

- [ ] **Step 1: Write the failing tests**

```ts
import { TAU, circlePoint, intersect, normAngle } from "../src/diagram/geometry";

describe("normAngle", () => {
  it("wraps into [0, TAU)", () => {
    expect(normAngle(-Math.PI / 2)).toBeCloseTo((3 * Math.PI) / 2);
    expect(normAngle(TAU + 0.5)).toBeCloseTo(0.5);
    expect(normAngle(TAU)).toBe(0);
  });
});

describe("circlePoint", () => {
  it("lies on the unit circle", () => {
    const p = circlePoint(1.2);
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(1);
    expect(circlePoint(0)).toEqual({ x: 1, y: 0 });
  });
});

describe("intersect", () => {
  const P = (x: number, y: number) => ({ x, y });

  it("finds a proper crossing with parameters", () => {
    const r = intersect(P(0, 0), P(2, 2), P(0, 2), P(2, 0));
    expect(r.kind).toBe("hit");
    if (r.kind === "hit") {
      expect(r.t).toBeCloseTo(0.5);
      expect(r.u).toBeCloseTo(0.5);
      expect(r.x).toBeCloseTo(1);
      expect(r.y).toBeCloseTo(1);
    }
  });

  it("reports none for separated, parallel and non-overlapping collinear segments", () => {
    expect(intersect(P(0, 0), P(1, 0), P(0, 1), P(1, 1)).kind).toBe("none");
    expect(intersect(P(0, 0), P(1, 1), P(3, 0), P(4, 1)).kind).toBe("none");
    expect(intersect(P(0, 0), P(1, 0), P(2, 0), P(3, 0)).kind).toBe("none");
    expect(intersect(P(0, 0), P(1, 1), P(2, 0), P(2, 1)).kind).toBe("none");
  });

  it("reports degenerate when they touch at an endpoint or overlap collinearly", () => {
    expect(intersect(P(0, 0), P(2, 0), P(1, 0), P(1, 1)).kind).toBe("degenerate");
    expect(intersect(P(0, 0), P(2, 0), P(2, -1), P(2, 1)).kind).toBe("degenerate");
    expect(intersect(P(0, 0), P(2, 0), P(1, 0), P(3, 0)).kind).toBe("degenerate");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- tests/geometry.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`src/diagram/geometry.ts`:
```ts
export interface Point {
  x: number;
  y: number;
}

export const TAU = Math.PI * 2;
const EPS = 1e-9;

export function normAngle(a: number): number {
  const r = a % TAU;
  return r < 0 ? r + TAU : r;
}

export function circlePoint(angle: number): Point {
  return { x: Math.cos(angle), y: Math.sin(angle) };
}

export type IntersectResult =
  | { kind: "none" }
  | { kind: "degenerate" }
  | { kind: "hit"; t: number; u: number; x: number; y: number };

export function intersect(p1: Point, p2: Point, p3: Point, p4: Point): IntersectResult {
  const d1x = p2.x - p1.x, d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x, d2y = p4.y - p3.y;
  const ex = p3.x - p1.x, ey = p3.y - p1.y;
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < EPS) {
    if (Math.abs(ex * d1y - ey * d1x) > EPS) return { kind: "none" };
    const l2 = d1x * d1x + d1y * d1y;
    const s3 = (ex * d1x + ey * d1y) / l2;
    const s4 = ((p4.x - p1.x) * d1x + (p4.y - p1.y) * d1y) / l2;
    const lo = Math.min(s3, s4), hi = Math.max(s3, s4);
    return hi < -EPS || lo > 1 + EPS ? { kind: "none" } : { kind: "degenerate" };
  }
  const t = (ex * d2y - ey * d2x) / den;
  const u = (ex * d1y - ey * d1x) / den;
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return { kind: "none" };
  if (t < EPS || t > 1 - EPS || u < EPS || u > 1 - EPS) return { kind: "degenerate" };
  return { kind: "hit", t, u, x: p1.x + d1x * t, y: p1.y + d1y * t };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- tests/geometry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/diagram/geometry.ts tests/geometry.test.ts
git commit -m "feat: add diagram geometry helpers"
```

---

### Task 4: Diagram types, creation, cyclic order and gaps

**Files:**
- Create: `src/diagram/types.ts`, `src/diagram/create.ts`, `src/diagram/order.ts`, `src/diagram/index.ts`
- Test: `tests/order.test.ts`

**Interfaces:**
- Produces (types):
```ts
export interface Vertex { x: number; y: number; kind: "end" | "fold" | "crossing"; crossingId?: number; overHere?: boolean }
export interface Crossing { id: number; a: number; b: number; over: number }
export interface RopeD { id: number; vertices: Vertex[] }   // vertices[0] is end 0, last is end 1
export interface EndRef { rope: number; end: 0 | 1 }
export interface EndPos extends EndRef { angle: number }
export interface Gap { after: EndRef; before: EndRef }     // counterclockwise from `after` to `before`
export interface Diagram { ropes: RopeD[]; crossings: Map<number, Crossing>; ends: EndPos[]; nextCrossingId: number }
export class DiagramDegenerate extends Error {}
```
- Produces (functions): `createDiagram(ropeCount: number): Diagram`, `cloneDiagram(d): Diagram`, `endPos(d, ref: EndRef): EndPos`, `sameEnd(a: EndRef, b: EndRef): boolean`, `cyclicOrder(d, exclude?: EndRef): EndPos[]`, `gapMidpoint(d, gap: Gap): number`, `gapContaining(d, angle: number, exclude?: EndRef): Gap`, `gapOf(d, ref: EndRef): Gap` (the gap between the end's two neighbors, excluding the end itself).
- A crossing vertex carries `crossingId` and `overHere` (true on the strand that is on top). Self-crossings have `a === b` and two vertices in the same rope, one with `overHere` true and one false.

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- tests/order.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`src/diagram/types.ts`:
```ts
export interface Vertex {
  x: number;
  y: number;
  kind: "end" | "fold" | "crossing";
  crossingId?: number;
  overHere?: boolean;
}

export interface Crossing {
  id: number;
  a: number;
  b: number;
  over: number;
}

export interface RopeD {
  id: number;
  vertices: Vertex[];
}

export interface EndRef {
  rope: number;
  end: 0 | 1;
}

export interface EndPos extends EndRef {
  angle: number;
}

export interface Gap {
  after: EndRef;
  before: EndRef;
}

export interface Diagram {
  ropes: RopeD[];
  crossings: Map<number, Crossing>;
  ends: EndPos[];
  nextCrossingId: number;
}

export class DiagramDegenerate extends Error {}
```

`src/diagram/create.ts`:
```ts
import { TAU, circlePoint } from "./geometry";
import type { Diagram, EndPos, RopeD } from "./types";

export function createDiagram(ropeCount: number): Diagram {
  if (ropeCount < 1) throw new Error("createDiagram: need at least one rope");
  const ropes: RopeD[] = [];
  const ends: EndPos[] = [];
  const step = TAU / (2 * ropeCount);
  for (let i = 0; i < ropeCount; i++) {
    const a0 = 2 * i * step, a1 = (2 * i + 1) * step;
    const p0 = circlePoint(a0), p1 = circlePoint(a1);
    ropes.push({ id: i, vertices: [{ x: p0.x, y: p0.y, kind: "end" }, { x: p1.x, y: p1.y, kind: "end" }] });
    ends.push({ rope: i, end: 0, angle: a0 }, { rope: i, end: 1, angle: a1 });
  }
  return { ropes, crossings: new Map(), ends, nextCrossingId: 1 };
}

export function cloneDiagram(d: Diagram): Diagram {
  return {
    ropes: d.ropes.map((r) => ({ id: r.id, vertices: r.vertices.map((v) => ({ ...v })) })),
    crossings: new Map([...d.crossings].map(([id, c]) => [id, { ...c }])),
    ends: d.ends.map((e) => ({ ...e })),
    nextCrossingId: d.nextCrossingId,
  };
}
```

`src/diagram/order.ts`:
```ts
import { TAU, normAngle } from "./geometry";
import type { Diagram, EndPos, EndRef, Gap } from "./types";

export function sameEnd(a: EndRef, b: EndRef): boolean {
  return a.rope === b.rope && a.end === b.end;
}

export function endPos(d: Diagram, ref: EndRef): EndPos {
  const e = d.ends[ref.rope * 2 + ref.end];
  if (!e) throw new Error(`no such end ${ref.rope}:${ref.end}`);
  return e;
}

export function cyclicOrder(d: Diagram, exclude?: EndRef): EndPos[] {
  return d.ends
    .filter((e) => !(exclude && sameEnd(e, exclude)))
    .slice()
    .sort((p, q) => p.angle - q.angle);
}

export function gapMidpoint(d: Diagram, gap: Gap): number {
  const a = endPos(d, gap.after).angle;
  const b = endPos(d, gap.before).angle;
  let span = normAngle(b - a);
  if (span === 0) span = TAU;
  return normAngle(a + span / 2);
}

export function gapContaining(d: Diagram, angle: number, exclude?: EndRef): Gap {
  const order = cyclicOrder(d, exclude);
  if (order.length === 0) throw new Error("gapContaining: no ends");
  const a = normAngle(angle);
  let i = order.length - 1;
  for (let k = 0; k < order.length; k++) {
    if (order[k]!.angle <= a) i = k;
    else break;
  }
  const after = order[i]!, before = order[(i + 1) % order.length]!;
  return { after: { rope: after.rope, end: after.end }, before: { rope: before.rope, end: before.end } };
}

export function gapOf(d: Diagram, ref: EndRef): Gap {
  return gapContaining(d, endPos(d, ref).angle, ref);
}
```

`src/diagram/index.ts`:
```ts
export * from "./types";
export * from "./geometry";
export * from "./create";
export * from "./order";
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- tests/order.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/diagram tests/order.test.ts
git commit -m "feat: add diagram types, creation and cyclic order"
```

---

### Task 5: Queries

**Files:**
- Create: `src/diagram/queries.ts`
- Modify: `src/diagram/index.ts` (add `export * from "./queries";`)
- Test: `tests/queries.test.ts`

**Interfaces:**
- Produces: `type Label = "over" | "under"`, `pairSequence(d, a: number, b: number, fromEnd: 0 | 1 = 0): Label[]` (labels from `a`'s point of view, ordered along `a` from `fromEnd`; for `a === b` the labels of both occurrences of each self-crossing), `isHooked(d, a, b): boolean` (false when `a === b`), `hookedRopes(d): Set<number>`, `crossingCount(d, rope): number` (self-crossings excluded), `alternate(d, a, b): boolean` (the two ropes' ends alternate around the circle), `checkConsistent(d): void` (throws if any crossing id is not referenced by exactly two vertices with the right ropes and exactly one `overHere`; used by tests).

- [ ] **Step 1: Write the failing tests**

The tests build small diagrams by hand with a helper, so they don't depend on `moveEnd`.

```ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- tests/queries.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`src/diagram/queries.ts`:
```ts
import { normAngle } from "./geometry";
import { endPos } from "./order";
import type { Diagram } from "./types";

export type Label = "over" | "under";

function partnerOf(d: Diagram, ropeId: number, crossingId: number): number {
  const c = d.crossings.get(crossingId);
  if (!c) throw new Error(`unknown crossing ${crossingId}`);
  return c.a === ropeId ? c.b : c.a;
}

export function pairSequence(d: Diagram, a: number, b: number, fromEnd: 0 | 1 = 0): Label[] {
  const rope = d.ropes[a];
  if (!rope) throw new Error(`no rope ${a}`);
  const out: Label[] = [];
  const vs = fromEnd === 0 ? rope.vertices : rope.vertices.slice().reverse();
  for (const v of vs) {
    if (v.kind !== "crossing") continue;
    if (partnerOf(d, a, v.crossingId!) !== b) continue;
    out.push(v.overHere ? "over" : "under");
  }
  return out;
}

export function isHooked(d: Diagram, a: number, b: number): boolean {
  if (a === b) return false;
  const seq = pairSequence(d, a, b);
  return seq.includes("over") && seq.includes("under");
}

export function hookedRopes(d: Diagram): Set<number> {
  const out = new Set<number>();
  for (const c of d.crossings.values()) {
    if (c.a === c.b) continue;
    if (isHooked(d, c.a, c.b)) {
      out.add(c.a);
      out.add(c.b);
    }
  }
  return out;
}

export function crossingCount(d: Diagram, ropeId: number): number {
  const rope = d.ropes[ropeId];
  if (!rope) throw new Error(`no rope ${ropeId}`);
  let n = 0;
  for (const v of rope.vertices) {
    if (v.kind === "crossing" && partnerOf(d, ropeId, v.crossingId!) !== ropeId) n++;
  }
  return n;
}

export function alternate(d: Diagram, a: number, b: number): boolean {
  const a0 = endPos(d, { rope: a, end: 0 }).angle, a1 = endPos(d, { rope: a, end: 1 }).angle;
  const span = normAngle(a1 - a0);
  const inside = (x: number) => normAngle(x - a0) < span;
  return inside(endPos(d, { rope: b, end: 0 }).angle) !== inside(endPos(d, { rope: b, end: 1 }).angle);
}

export function checkConsistent(d: Diagram): void {
  const seen = new Map<number, { ropes: number[]; overs: number }>();
  for (const r of d.ropes) {
    for (const v of r.vertices) {
      if (v.kind !== "crossing") continue;
      const id = v.crossingId;
      if (id === undefined || !d.crossings.has(id)) throw new Error(`vertex refers to missing crossing ${id}`);
      let s = seen.get(id);
      if (!s) seen.set(id, (s = { ropes: [], overs: 0 }));
      s.ropes.push(r.id);
      if (v.overHere) s.overs++;
    }
  }
  for (const c of d.crossings.values()) {
    const s = seen.get(c.id);
    if (!s || s.ropes.length !== 2) throw new Error(`crossing ${c.id} has ${s?.ropes.length ?? 0} vertices`);
    const [x, y] = s.ropes as [number, number];
    if (!((x === c.a && y === c.b) || (x === c.b && y === c.a))) throw new Error(`crossing ${c.id} ropes mismatch`);
    if (s.overs !== 1) throw new Error(`crossing ${c.id} has ${s.overs} over strands`);
    if (c.over !== c.a && c.over !== c.b) throw new Error(`crossing ${c.id} over is neither rope`);
  }
  if (seen.size !== d.crossings.size) throw new Error("vertex/crossing count mismatch");
}
```

Add to `src/diagram/index.ts`: `export * from "./queries";`

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- tests/queries.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/diagram tests/queries.test.ts
git commit -m "feat: add diagram queries"
```

---

### Task 6: The move

**Files:**
- Create: `src/diagram/move.ts`
- Modify: `src/diagram/index.ts` (add `export * from "./move";`)
- Test: `tests/move.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 3–5.
- Produces: `moveEnd(d: Diagram, rope: number, end: 0 | 1, gap: Gap): void` and `liftedStretch(d, rope, end): number[]` (ids of the crossings a move of that end would remove). `moveEnd` mutates `d`; on an unrecoverable degeneracy it leaves `d` unchanged and throws `DiagramDegenerate`.

How `moveEnd` works (spec §6.2, with two details the spec leaves to the implementation):

1. Orient the rope so the moved end is last. Walk backward to find the hold-down: the last crossing vertex where this rope is under **and whose over strand is not itself in the lifted stretch** (a self-crossing whose over strand lies further toward the moved end does not hold anything down). If none, the hold-down is the other end.
2. Every crossing vertex beyond the hold-down is lifted: delete those crossings from the map and strip their vertices from every rope (including the retained part of this rope, for self-crossings).
3. The new segment starts not at the hold-down X itself but at a **stub** `X + STUB × (direction toward the first lifted vertex)`, with `STUB = 1e-4`. The rope emerges from under its partner on the far side of X before it is lifted, so the straight segment from the stub to the target crosses the partner's rope right next to X when the target lies on the near side: that crossing is the over-crossing that makes a hook. Without the stub the segment would start on the partner's strand and the crossing would be missed. When the hold-down is the other end, there is no stub.
4. Intersect `stub → target` with every segment of every rope (the retained part of this rope included), except the retained segment that ends at X (it can only meet the new segment within `STUB` of X, which is a trivial loop). Any `degenerate` result aborts the attempt.
5. Insert the hits: into the other ropes' vertex lists (sorted by `u`, segments processed in descending index so indices stay valid) and along the new segment sorted by `t`. Crossing records get `over = rope`; this rope's vertices get `overHere = true`, the partners `false`.
6. Attempts: the target angle is the gap midpoint; on a degenerate attempt, restore the snapshot and retry with the angle nudged by `±k × 1e-3 × gap span` for `k = 1..4`; then throw.

- [ ] **Step 1: Write the failing tests**

```ts
import { createDiagram, cyclicOrder, endPos, gapContaining, gapOf, type Diagram, type EndRef, type Gap } from "../src/diagram";
import { liftedStretch, moveEnd } from "../src/diagram/move";
import { alternate, checkConsistent, crossingCount, isHooked, pairSequence } from "../src/diagram/queries";
import { TAU } from "../src/diagram/geometry";
import { mulberry32 } from "../src/util/rng";

const deg = (x: number) => (x / 360) * TAU;

function twoRopes(): Diagram {
  return createDiagram(2); // A: 0°→90°, B: 180°→270°
}

describe("moveEnd", () => {
  it("creates a single over-crossing when the move makes two ropes alternate", () => {
    const d = twoRopes();
    const gap: Gap = { after: { rope: 1, end: 0 }, before: { rope: 1, end: 1 } };
    moveEnd(d, 0, 1, gap);
    expect(endPos(d, { rope: 0, end: 1 }).angle).toBeCloseTo(deg(225));
    expect(pairSequence(d, 0, 1)).toEqual(["over"]);
    expect(pairSequence(d, 1, 0)).toEqual(["under"]);
    expect(alternate(d, 0, 1)).toBe(true);
    checkConsistent(d);
  });

  it("hooks a rope that was under when its end is moved back across", () => {
    const d = twoRopes();
    moveEnd(d, 0, 1, { after: { rope: 1, end: 0 }, before: { rope: 1, end: 1 } });
    moveEnd(d, 1, 0, { after: { rope: 1, end: 1 }, before: { rope: 0, end: 0 } });
    expect(endPos(d, { rope: 1, end: 0 }).angle).toBeCloseTo(deg(315));
    expect(pairSequence(d, 1, 0)).toEqual(["under", "over"]);
    expect(isHooked(d, 0, 1)).toBe(true);
    expect(alternate(d, 0, 1)).toBe(false);
    expect(crossingCount(d, 1)).toBe(2);
    checkConsistent(d);
  });

  it("lifts the whole rope when it has no under-crossings and removes its over-crossings", () => {
    const d = twoRopes();
    moveEnd(d, 0, 1, { after: { rope: 1, end: 0 }, before: { rope: 1, end: 1 } });
    expect(liftedStretch(d, 0, 1)).toHaveLength(1);
    moveEnd(d, 0, 1, gapOf(d, { rope: 0, end: 1 }).after === undefined ? gapOf(d, { rope: 0, end: 1 }) : { after: { rope: 0, end: 0 }, before: { rope: 1, end: 0 } });
    expect(d.crossings.size).toBe(0);
    expect(d.ropes[0]!.vertices).toHaveLength(2);
    checkConsistent(d);
  });

  it("moving an end back into the gap it came from undoes a plain crossing", () => {
    const d = twoRopes();
    const home = gapOf(d, { rope: 0, end: 1 });
    moveEnd(d, 0, 1, { after: { rope: 1, end: 0 }, before: { rope: 1, end: 1 } });
    moveEnd(d, 0, 1, home);
    expect(d.crossings.size).toBe(0);
    expect(pairSequence(d, 0, 1)).toEqual([]);
    checkConsistent(d);
  });

  it("moving an end within its own gap keeps the tangle", () => {
    const d = twoRopes();
    moveEnd(d, 0, 1, { after: { rope: 1, end: 0 }, before: { rope: 1, end: 1 } });
    moveEnd(d, 1, 0, { after: { rope: 1, end: 1 }, before: { rope: 0, end: 0 } });
    const before = pairSequence(d, 1, 0);
    moveEnd(d, 1, 0, gapOf(d, { rope: 1, end: 0 }));
    expect(pairSequence(d, 1, 0)).toEqual(before);
    checkConsistent(d);
  });

  it("does not stop the walk at a self-crossing whose over strand is being lifted", () => {
    // A hooks under B, then A's end loops over A's own retained part, then B's end leaves.
    const d = createDiagram(3);
    moveEnd(d, 0, 1, { after: { rope: 1, end: 0 }, before: { rope: 1, end: 1 } });            // A over B
    moveEnd(d, 1, 0, { after: { rope: 1, end: 1 }, before: { rope: 2, end: 0 } });            // B hooks on A
    moveEnd(d, 1, 0, gapContaining(d, endPos(d, { rope: 1, end: 1 }).angle - 0.05, { rope: 1, end: 0 })); // B's end back over its own strand
    const selfLabels = pairSequence(d, 1, 1);
    expect(selfLabels.length === 0 || selfLabels.length === 2).toBe(true);
    checkConsistent(d);
    // Whatever B looks like now, lifting B's end 0 again must leave a consistent diagram and never a dangling hold-down.
    moveEnd(d, 1, 0, { after: { rope: 2, end: 0 }, before: { rope: 2, end: 1 } });
    checkConsistent(d);
    expect(pairSequence(d, 1, 1)).toEqual([]);
  });

  it("keeps the parity invariant and consistency over random moves", () => {
    const rng = mulberry32(3);
    for (const n of [2, 3, 5, 8]) {
      const d = createDiagram(n);
      for (let step = 0; step < 150; step++) {
        const ref: EndRef = { rope: Math.floor(rng() * n), end: rng() < 0.5 ? 0 : 1 };
        const order = cyclicOrder(d, ref);
        const i = Math.floor(rng() * order.length);
        const after = order[i]!, before = order[(i + 1) % order.length]!;
        moveEnd(d, ref.rope, ref.end, { after: { rope: after.rope, end: after.end }, before: { rope: before.rope, end: before.end } });
        checkConsistent(d);
        for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
          expect(pairSequence(d, a, b).length % 2 === 1).toBe(alternate(d, a, b));
        }
      }
    }
  });

  it("is deterministic: the same moves give the same diagram", () => {
    const run = () => {
      const d = createDiagram(4);
      moveEnd(d, 0, 1, { after: { rope: 2, end: 0 }, before: { rope: 2, end: 1 } });
      moveEnd(d, 2, 0, { after: { rope: 3, end: 1 }, before: { rope: 0, end: 0 } });
      moveEnd(d, 1, 1, { after: { rope: 0, end: 1 }, before: { rope: 2, end: 1 } });
      return d;
    };
    expect(run()).toEqual(run());
  });
});
```

Note for the third test: replace its awkward second `moveEnd` line with the direct gap `{ after: { rope: 0, end: 0 }, before: { rope: 1, end: 0 } }` (the conditional is a leftover; the intent is "move A's end 1 somewhere that no longer alternates with B").

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- tests/move.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`src/diagram/move.ts`:
```ts
import { cloneDiagram } from "./create";
import { circlePoint, intersect, normAngle, TAU, type Point } from "./geometry";
import { endPos, gapMidpoint } from "./order";
import { DiagramDegenerate, type Crossing, type Diagram, type Gap, type Vertex } from "./types";

const STUB = 1e-4;
const NUDGE = 1e-3;

interface Hit {
  ropeId: number;
  segIndex: number;
  t: number;
  u: number;
  x: number;
  y: number;
}

function oriented(d: Diagram, ropeId: number, end: 0 | 1): Vertex[] {
  const rope = d.ropes[ropeId];
  if (!rope) throw new Error(`no rope ${ropeId}`);
  return end === 1 ? rope.vertices.slice() : rope.vertices.slice().reverse();
}

function holdDownIndex(d: Diagram, verts: Vertex[]): number {
  for (let i = verts.length - 1; i > 0; i--) {
    const v = verts[i]!;
    if (v.kind !== "crossing" || v.overHere) continue;
    const c = d.crossings.get(v.crossingId!)!;
    if (c.a === c.b) {
      const j = verts.findIndex((w, k) => k !== i && w.kind === "crossing" && w.crossingId === v.crossingId);
      if (j > i) continue;
    }
    return i;
  }
  return 0;
}

export function liftedStretch(d: Diagram, ropeId: number, end: 0 | 1): number[] {
  const verts = oriented(d, ropeId, end);
  const h = holdDownIndex(d, verts);
  const ids: number[] = [];
  for (let i = h + 1; i < verts.length; i++) {
    const v = verts[i]!;
    if (v.kind === "crossing" && !ids.includes(v.crossingId!)) ids.push(v.crossingId!);
  }
  return ids;
}

function restore(d: Diagram, snap: Diagram): void {
  d.ropes = snap.ropes;
  d.crossings = snap.crossings;
  d.ends = snap.ends;
  d.nextCrossingId = snap.nextCrossingId;
}

export function moveEnd(d: Diagram, ropeId: number, end: 0 | 1, gap: Gap): void {
  const mid = gapMidpoint(d, gap);
  let span = normAngle(endPos(d, gap.before).angle - endPos(d, gap.after).angle);
  if (span === 0) span = TAU;
  const offsets = [0, 1, -1, 2, -2, 3, -3, 4, -4];
  for (const k of offsets) {
    const snap = cloneDiagram(d);
    try {
      applyMove(d, ropeId, end, normAngle(mid + k * NUDGE * span));
      return;
    } catch (e) {
      restore(d, snap);
      if (!(e instanceof DiagramDegenerate)) throw e;
    }
  }
  throw new DiagramDegenerate(`moveEnd: rope ${ropeId} end ${end} cannot be placed`);
}

function applyMove(d: Diagram, ropeId: number, end: 0 | 1, angle: number): void {
  const verts = oriented(d, ropeId, end);
  const h = holdDownIndex(d, verts);
  const lifted = new Set<number>();
  for (let i = h + 1; i < verts.length; i++) {
    const v = verts[i]!;
    if (v.kind === "crossing") lifted.add(v.crossingId!);
  }
  const X = verts[h]!;
  const next = verts[h + 1]!;
  const stubDir: Point | null = h > 0 ? unit(next.x - X.x, next.y - X.y) : null;

  for (const id of lifted) d.crossings.delete(id);
  const strip = (vs: Vertex[]) => vs.filter((v) => !(v.kind === "crossing" && lifted.has(v.crossingId!)));
  for (const o of d.ropes) if (o.id !== ropeId) o.vertices = strip(o.vertices);
  const retained = strip(verts.slice(0, h + 1));

  const P = circlePoint(angle);
  const stub: Vertex | null = stubDir ? { x: X.x + stubDir.x * STUB, y: X.y + stubDir.y * STUB, kind: "fold" } : null;
  const start: Point = stub ?? X;

  const hits: Hit[] = [];
  for (const o of d.ropes) {
    const vs = o.id === ropeId ? retained : o.vertices;
    for (let k = 0; k + 1 < vs.length; k++) {
      if (o.id === ropeId && stub && k === vs.length - 2) continue;
      const r = intersect(start, P, vs[k]!, vs[k + 1]!);
      if (r.kind === "degenerate") throw new DiagramDegenerate("segment touches a vertex");
      if (r.kind === "hit") hits.push({ ropeId: o.id, segIndex: k, t: r.t, u: r.u, x: r.x, y: r.y });
    }
  }
  hits.sort((p, q) => p.t - q.t);

  const alongNew: Vertex[] = [];
  const byRope = new Map<number, { hit: Hit; id: number }[]>();
  for (const hit of hits) {
    const id = d.nextCrossingId++;
    const c: Crossing = { id, a: ropeId, b: hit.ropeId, over: ropeId };
    d.crossings.set(id, c);
    alongNew.push({ x: hit.x, y: hit.y, kind: "crossing", crossingId: id, overHere: true });
    let list = byRope.get(hit.ropeId);
    if (!list) byRope.set(hit.ropeId, (list = []));
    list.push({ hit, id });
  }

  const insertInto = (vs: Vertex[], list: { hit: Hit; id: number }[]) => {
    const bySeg = new Map<number, { hit: Hit; id: number }[]>();
    for (const e of list) {
      let l = bySeg.get(e.hit.segIndex);
      if (!l) bySeg.set(e.hit.segIndex, (l = []));
      l.push(e);
    }
    const segs = [...bySeg.keys()].sort((p, q) => q - p);
    for (const seg of segs) {
      const l = bySeg.get(seg)!.sort((p, q) => p.hit.u - q.hit.u);
      vs.splice(seg + 1, 0, ...l.map((e) => ({ x: e.hit.x, y: e.hit.y, kind: "crossing" as const, crossingId: e.id, overHere: false })));
    }
  };
  for (const [oid, list] of byRope) {
    if (oid === ropeId) insertInto(retained, list);
    else insertInto(d.ropes[oid]!.vertices, list);
  }

  const final = retained.concat(stub ? [stub] : [], alongNew, [{ x: P.x, y: P.y, kind: "end" }]);
  d.ropes[ropeId]!.vertices = end === 1 ? final : final.reverse();
  const e = endPos(d, { rope: ropeId, end });
  e.angle = angle;
}

function unit(x: number, y: number): Point {
  const l = Math.hypot(x, y);
  if (l < 1e-12) throw new DiagramDegenerate("zero-length stub direction");
  return { x: x / l, y: y / l };
}
```

Add to `src/diagram/index.ts`: `export * from "./move";`

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- tests/move.test.ts`
Expected: PASS. If the hook test fails on the sequence, check the stub direction: it must point from X toward the first lifted vertex (the old continuation), not toward the target.

- [ ] **Step 5: Run the whole suite and typecheck**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add src/diagram tests/move.test.ts
git commit -m "feat: add the diagram move operation"
```

---

### Task 7: Recipe types, parity-flip gap and the Cross recipe

**Files:**
- Create: `src/recipes/types.ts`, `src/recipes/flip.ts`, `src/recipes/cross.ts`
- Test: `tests/recipes.test.ts`

**Interfaces:**
- Produces:
```ts
export interface Move { rope: number; end: 0 | 1; gap: Gap }
export interface Recipe {
  name: string;
  weight: number;
  match(d: Diagram, a: number, b: number, end: 0 | 1): boolean;   // can `a`'s `end` be moved for this recipe with partner `b`?
  apply(d: Diagram, a: number, b: number, end: 0 | 1): Move[];    // mutates d, returns the moves made
}
export function flipGap(d: Diagram, moving: EndRef, partner: number): Gap
export const cross: Recipe
```
- `flipGap` returns the gap (in the cyclic order without `moving`) that contains the midpoint of the arc between `partner`'s ends that does **not** contain `moving`'s current angle. Moving into it flips whether the two ropes alternate.

- [ ] **Step 1: Write the failing tests**

```ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- tests/recipes.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`src/recipes/types.ts`:
```ts
import type { Diagram, Gap } from "../diagram";

export interface Move {
  rope: number;
  end: 0 | 1;
  gap: Gap;
}

export interface Recipe {
  name: string;
  weight: number;
  match(d: Diagram, a: number, b: number, end: 0 | 1): boolean;
  apply(d: Diagram, a: number, b: number, end: 0 | 1): Move[];
}
```

`src/recipes/flip.ts`:
```ts
import { endPos, gapContaining, normAngle, type Diagram, type EndRef, type Gap } from "../diagram";

export function flipGap(d: Diagram, moving: EndRef, partner: number): Gap {
  const p0 = endPos(d, { rope: partner, end: 0 }).angle;
  const p1 = endPos(d, { rope: partner, end: 1 }).angle;
  const cur = endPos(d, moving).angle;
  const span01 = normAngle(p1 - p0);
  const inFirst = normAngle(cur - p0) < span01;
  const start = inFirst ? p1 : p0;
  const span = inFirst ? normAngle(p0 - p1) : span01;
  return gapContaining(d, normAngle(start + span / 2), moving);
}
```

`src/recipes/cross.ts`:
```ts
import { moveEnd, pairSequence, type Diagram } from "../diagram";
import { flipGap } from "./flip";
import type { Move, Recipe } from "./types";

export const cross: Recipe = {
  name: "cross",
  weight: 1,
  match(d: Diagram, a: number, b: number): boolean {
    return a !== b && pairSequence(d, a, b).length === 0;
  },
  apply(d: Diagram, a: number, b: number, end: 0 | 1): Move[] {
    const gap = flipGap(d, { rope: a, end }, b);
    moveEnd(d, a, end, gap);
    return [{ rope: a, end, gap }];
  },
};
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- tests/recipes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/recipes tests/recipes.test.ts
git commit -m "feat: add recipe types and the cross recipe"
```

---

### Task 8: Hook recipe

**Files:**
- Create: `src/recipes/hook.ts`
- Test: `tests/recipes.test.ts` (append)

**Interfaces:**
- Consumes: `flipGap`, `pairSequence`, `moveEnd`, `Recipe`.
- Produces: `export const hook: Recipe` (weight 3). `match`: the crossing of `a` with `b` nearest `a`'s `end` exists and is `under`. `apply`: one move of `a`'s `end` into `flipGap`.

- [ ] **Step 1: Write the failing tests** (append to `tests/recipes.test.ts`)

```ts
import { hook } from "../src/recipes/hook";
import { isHooked, hookedRopes } from "../src/diagram/queries";

describe("hook", () => {
  it("matches when the nearest crossing from the running end is under, and hooks", () => {
    const d = createDiagram(3);
    cross.apply(d, 0, 1, 1);                      // A over B
    expect(hook.match(d, 0, 1, 1)).toBe(false);   // A is over, not under
    expect(hook.match(d, 1, 0, 0)).toBe(true);
    expect(hook.match(d, 1, 0, 1)).toBe(true);
    const moves = hook.apply(d, 1, 0, 0);
    expect(moves).toHaveLength(1);
    expect(pairSequence(d, 1, 0)).toEqual(["under", "over"]);
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- tests/recipes.test.ts`
Expected: FAIL on the hook import.

- [ ] **Step 3: Implement**

`src/recipes/hook.ts`:
```ts
import { moveEnd, pairSequence, type Diagram } from "../diagram";
import { flipGap } from "./flip";
import type { Move, Recipe } from "./types";

export const hook: Recipe = {
  name: "hook",
  weight: 3,
  match(d: Diagram, a: number, b: number, end: 0 | 1): boolean {
    if (a === b) return false;
    return pairSequence(d, a, b, end)[0] === "under";
  },
  apply(d: Diagram, a: number, b: number, end: 0 | 1): Move[] {
    const gap = flipGap(d, { rope: a, end }, b);
    moveEnd(d, a, end, gap);
    return [{ rope: a, end, gap }];
  },
};
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- tests/recipes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/recipes/hook.ts tests/recipes.test.ts
git commit -m "feat: add the hook recipe"
```

---

### Task 9: Twist recipe

**Files:**
- Create: `src/recipes/twist.ts`
- Test: `tests/recipes.test.ts` (append)

**Interfaces:**
- Produces: `twist(turns: number, weight: number): Recipe` named `twist${turns}`. `match` = `hook.match`. `apply`: hook `a` on `b`, then alternately hook `b` on `a` and `a` on `b`, each time choosing the end of the moving rope whose nearest crossing with the partner is `under` (end 0 first); stops early when no such end exists. Returns all moves made. After `turns` hooks the pair sequence from the first running end reads `under, over, under, over, …` of length `turns + 1`.

- [ ] **Step 1: Write the failing tests** (append)

```ts
import { twist } from "../src/recipes/twist";

describe("twist", () => {
  it("winds two ropes around each other the requested number of times", () => {
    const d = createDiagram(4);
    cross.apply(d, 0, 1, 1);
    const t = twist(3, 1);
    expect(t.name).toBe("twist3");
    expect(t.match(d, 1, 0, 0)).toBe(true);
    const moves = t.apply(d, 1, 0, 0);
    expect(moves).toHaveLength(3);
    expect(pairSequence(d, 1, 0).length).toBe(4);
    expect(isHooked(d, 0, 1)).toBe(true);
    checkConsistent(d);
  });

  it("stops early but stays consistent when a turn cannot be made", () => {
    const d = createDiagram(2);
    cross.apply(d, 0, 1, 1);
    const moves = twist(6, 1).apply(d, 1, 0, 0);
    expect(moves.length).toBeGreaterThanOrEqual(1);
    expect(moves.length).toBeLessThanOrEqual(6);
    checkConsistent(d);
    expect(isHooked(d, 0, 1)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- tests/recipes.test.ts`
Expected: FAIL on the twist import.

- [ ] **Step 3: Implement**

`src/recipes/twist.ts`:
```ts
import { moveEnd, pairSequence, type Diagram } from "../diagram";
import { flipGap } from "./flip";
import { hook } from "./hook";
import type { Move, Recipe } from "./types";

function underEnd(d: Diagram, rope: number, partner: number): 0 | 1 | null {
  if (pairSequence(d, rope, partner, 0)[0] === "under") return 0;
  if (pairSequence(d, rope, partner, 1)[0] === "under") return 1;
  return null;
}

export function twist(turns: number, weight: number): Recipe {
  return {
    name: `twist${turns}`,
    weight,
    match: hook.match,
    apply(d: Diagram, a: number, b: number, end: 0 | 1): Move[] {
      const moves: Move[] = [];
      let mover = a, partner = b;
      let e: 0 | 1 | null = end;
      for (let i = 0; i < turns && e !== null; i++) {
        const gap = flipGap(d, { rope: mover, end: e }, partner);
        moveEnd(d, mover, e, gap);
        moves.push({ rope: mover, end: e, gap });
        [mover, partner] = [partner, mover];
        e = underEnd(d, mover, partner);
      }
      return moves;
    },
  };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- tests/recipes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/recipes/twist.ts tests/recipes.test.ts
git commit -m "feat: add the twist recipe"
```

---

### Task 10: Deck and scrambler

**Files:**
- Create: `src/recipes/deck.ts`, `src/recipes/index.ts`, `src/scramble/scramble.ts`
- Test: `tests/scramble.test.ts`

**Interfaces:**
- Produces:
```ts
export const deck: Recipe[]                                  // [cross, hook, twist(2, 1), twist(3, 0.5)]
export interface Difficulty { recipes: number; maxRecipes: number }
export function defaultDifficulty(ropeCount: number): Difficulty   // { recipes: ropeCount, maxRecipes: 4 * ropeCount }
export interface ScrambleLogEntry { recipe: string; a: number; b: number; end: 0 | 1; moves: Move[] }
export interface Scrambled { diagram: Diagram; log: ScrambleLogEntry[] }
export class ScrambleFailed extends Error {}
export function scramble(seed: number, ropeCount: number, difficulty?: Difficulty, recipes?: Recipe[]): Scrambled
export function scrambleWithRetry(seed: number, ropeCount: number, difficulty?: Difficulty, maxTries = 20): Scrambled & { seed: number }
export function replay(ropeCount: number, log: ScrambleLogEntry[]): Diagram
```
- Algorithm (spec §7.3): seeded RNG; `createDiagram`; loop up to `maxRecipes`: stop when `applied >= recipes` and every rope is hooked; else enumerate `(recipe, a, b, end)` with `a !== b` and `match` true; if none, throw `ScrambleFailed`; pick weighted by `recipe.weight`; `apply`; log. If `apply` throws `DiagramDegenerate`, skip that candidate (it is removed for this iteration and another is picked; after 20 such skips in one run, throw `ScrambleFailed`). After the loop, throw `ScrambleFailed` unless every rope is hooked.

- [ ] **Step 1: Write the failing tests**

```ts
import { createDiagram } from "../src/diagram";
import { checkConsistent, hookedRopes } from "../src/diagram/queries";
import { deck } from "../src/recipes/deck";
import { ScrambleFailed, defaultDifficulty, replay, scramble, scrambleWithRetry } from "../src/scramble/scramble";

describe("scramble", () => {
  it("hooks every rope and applies at least the requested recipes", () => {
    for (const n of [4, 5, 8, 10]) {
      for (let seed = 1; seed <= 15; seed++) {
        const { diagram, log } = scramble(seed, n);
        expect(hookedRopes(diagram).size).toBe(n);
        expect(log.length).toBeGreaterThanOrEqual(n);
        expect(log.length).toBeLessThanOrEqual(4 * n);
        checkConsistent(diagram);
      }
    }
  });

  it("is deterministic and replayable from the log", () => {
    const a = scramble(123, 6), b = scramble(123, 6);
    expect(a.diagram).toEqual(b.diagram);
    expect(replay(6, a.log)).toEqual(a.diagram);
    expect(scramble(124, 6).diagram).not.toEqual(a.diagram);
  });

  it("throws ScrambleFailed when no recipe can match", () => {
    const d = createDiagram(2);
    void d;
    expect(() => scramble(1, 2, { recipes: 1, maxRecipes: 1 }, [])).toThrow(ScrambleFailed);
  });

  it("retries seeds and reports the one that worked", () => {
    const r = scrambleWithRetry(5, 4);
    expect(r.seed).toBeGreaterThanOrEqual(5);
    expect(hookedRopes(r.diagram).size).toBe(4);
    expect(() => scrambleWithRetry(1, 2, { recipes: 50, maxRecipes: 50 }, 3)).toThrow(ScrambleFailed);
  });

  it("uses the default difficulty", () => {
    expect(defaultDifficulty(7)).toEqual({ recipes: 7, maxRecipes: 28 });
    expect(deck.map((r) => r.name)).toEqual(["cross", "hook", "twist2", "twist3"]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- tests/scramble.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`src/recipes/deck.ts`:
```ts
import { cross } from "./cross";
import { hook } from "./hook";
import { twist } from "./twist";
import type { Recipe } from "./types";

export const deck: Recipe[] = [cross, hook, twist(2, 1), twist(3, 0.5)];
```

`src/recipes/index.ts`:
```ts
export * from "./types";
export * from "./flip";
export * from "./cross";
export * from "./hook";
export * from "./twist";
export * from "./deck";
```

`src/scramble/scramble.ts`:
```ts
import { DiagramDegenerate, createDiagram, hookedRopes, moveEnd, type Diagram } from "../diagram";
import { deck, type Move, type Recipe } from "../recipes";
import { mulberry32, pickWeighted } from "../util/rng";

export interface Difficulty {
  recipes: number;
  maxRecipes: number;
}

export function defaultDifficulty(ropeCount: number): Difficulty {
  return { recipes: ropeCount, maxRecipes: 4 * ropeCount };
}

export interface ScrambleLogEntry {
  recipe: string;
  a: number;
  b: number;
  end: 0 | 1;
  moves: Move[];
}

export interface Scrambled {
  diagram: Diagram;
  log: ScrambleLogEntry[];
}

export class ScrambleFailed extends Error {}

interface Candidate {
  recipe: Recipe;
  a: number;
  b: number;
  end: 0 | 1;
}

const MAX_SKIPS = 20;

export function scramble(
  seed: number,
  ropeCount: number,
  difficulty: Difficulty = defaultDifficulty(ropeCount),
  recipes: Recipe[] = deck,
): Scrambled {
  const rng = mulberry32(seed);
  const d = createDiagram(ropeCount);
  const log: ScrambleLogEntry[] = [];
  let skips = 0;
  for (let applied = 0; applied < difficulty.maxRecipes; ) {
    if (applied >= difficulty.recipes && hookedRopes(d).size === ropeCount) break;
    let candidates: Candidate[] = [];
    for (const recipe of recipes) {
      for (let a = 0; a < ropeCount; a++) {
        for (let b = 0; b < ropeCount; b++) {
          if (a === b) continue;
          for (const end of [0, 1] as const) {
            if (recipe.match(d, a, b, end)) candidates.push({ recipe, a, b, end });
          }
        }
      }
    }
    while (candidates.length > 0) {
      const c = pickWeighted(rng, candidates, (x) => x.recipe.weight);
      try {
        const moves = c.recipe.apply(d, c.a, c.b, c.end);
        log.push({ recipe: c.recipe.name, a: c.a, b: c.b, end: c.end, moves });
        applied++;
        break;
      } catch (e) {
        if (!(e instanceof DiagramDegenerate)) throw e;
        if (++skips > MAX_SKIPS) throw new ScrambleFailed(`seed ${seed}: too many degenerate placements`);
        candidates = candidates.filter((x) => x !== c);
      }
    }
    if (candidates.length === 0) throw new ScrambleFailed(`seed ${seed}: no recipe matches`);
  }
  if (hookedRopes(d).size !== ropeCount) throw new ScrambleFailed(`seed ${seed}: ropes left unhooked after ${difficulty.maxRecipes} recipes`);
  return { diagram: d, log };
}

export function scrambleWithRetry(
  seed: number,
  ropeCount: number,
  difficulty: Difficulty = defaultDifficulty(ropeCount),
  maxTries = 20,
): Scrambled & { seed: number } {
  let lastError: unknown;
  for (let i = 0; i < maxTries; i++) {
    try {
      return { ...scramble(seed + i, ropeCount, difficulty), seed: seed + i };
    } catch (e) {
      if (!(e instanceof ScrambleFailed)) throw e;
      lastError = e;
    }
  }
  throw new ScrambleFailed(`no board after ${maxTries} seeds from ${seed}: ${String(lastError)}`);
}

export function replay(ropeCount: number, log: ScrambleLogEntry[]): Diagram {
  const d = createDiagram(ropeCount);
  for (const entry of log) for (const m of entry.moves) moveEnd(d, m.rope, m.end, m.gap);
  return d;
}
```

Note: a `Twist` that stops early may still have applied some moves before a later `DiagramDegenerate`; `moveEnd` restores the diagram on its own failure, so the diagram is always consistent, and the log entry for that candidate is simply not written. That is acceptable for the scrambler; `replay` only replays logged moves, and the determinism test covers the common path.

- [ ] **Step 4: Run to verify pass**

Run: `npm test -- tests/scramble.test.ts`
Expected: PASS. If "hooks every rope" fails for a seed, print `log` for that seed and check whether the loop stopped on `maxRecipes`; raising `MAX_SKIPS` is not the fix — look at which rope stayed unhooked and why no recipe matched it.

- [ ] **Step 5: Measure**

Add a temporary `console.time` around `scramble(seed, 10)` in a scratch test or the REPL. Expected: well under 50 ms per 10-rope board on the Mac mini. Remove the scratch code.

- [ ] **Step 6: Full suite, typecheck, commit**

Run: `npm test && npm run typecheck && npm run lint`

```bash
git add src/recipes src/scramble tests/scramble.test.ts
git commit -m "feat: add the recipe deck and scrambler"
```

---

### Task 11: Dev page

**Files:**
- Create: `src/devpage/draw.ts`
- Modify: `src/main.ts`, `index.html`

**Interfaces:**
- Produces: `drawDiagram(ctx: CanvasRenderingContext2D, d: Diagram, size: number): void` — draws the unit circle, each rope as a colored polyline, and each crossing as a dot in the color of the rope on top. The page reads `?seed=` and `?ropes=` from the URL, shows the log, and has Prev/Next seed links.

- [ ] **Step 1: Implement**

`src/devpage/draw.ts`:
```ts
import type { Diagram } from "../diagram";

export const COLORS = ["#2e9e3a", "#2f7fe0", "#e0453a", "#f0a020", "#8e44d0", "#18b3b3", "#e05fa8", "#8a5a33", "#b8a800", "#5c6b7a"];

export function drawDiagram(ctx: CanvasRenderingContext2D, d: Diagram, size: number): void {
  const c = size / 2, r = size * 0.46;
  const X = (x: number) => c + x * r, Y = (y: number) => c + y * r;
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = "#ccd";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.stroke();
  for (const rope of d.ropes) {
    ctx.strokeStyle = COLORS[rope.id % COLORS.length]!;
    ctx.lineWidth = 3;
    ctx.beginPath();
    rope.vertices.forEach((v, i) => (i === 0 ? ctx.moveTo(X(v.x), Y(v.y)) : ctx.lineTo(X(v.x), Y(v.y))));
    ctx.stroke();
    for (const e of [rope.vertices[0]!, rope.vertices[rope.vertices.length - 1]!]) {
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      ctx.arc(X(e.x), Y(e.y), 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (const rope of d.ropes) {
    for (const v of rope.vertices) {
      if (v.kind !== "crossing" || !v.overHere) continue;
      ctx.fillStyle = COLORS[rope.id % COLORS.length]!;
      ctx.beginPath();
      ctx.arc(X(v.x), Y(v.y), 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}
```

`src/main.ts`:
```ts
import { drawDiagram } from "./devpage/draw";
import { scrambleWithRetry } from "./scramble/scramble";

const q = new URLSearchParams(location.search);
const seed = Number(q.get("seed") ?? 1);
const ropes = Number(q.get("ropes") ?? 5);
const { diagram, log, seed: used } = scrambleWithRetry(seed, ropes);

const canvas = document.getElementById("cv") as HTMLCanvasElement;
const size = Math.min(innerWidth, innerHeight - 80);
canvas.width = size;
canvas.height = size;
drawDiagram(canvas.getContext("2d")!, diagram, size);

const info = document.getElementById("info")!;
info.innerHTML =
  `seed ${used} · ${ropes} ropes · ${log.length} recipes · ${diagram.crossings.size} crossings ` +
  `<a href="?seed=${used - 1}&ropes=${ropes}">prev</a> <a href="?seed=${used + 1}&ropes=${ropes}">next</a><br>` +
  log.map((e) => `${e.recipe}(${e.a}→${e.b})`).join(" ");
```

`index.html` body:
```html
  <body style="margin:0;font:14px system-ui;background:#eef1f8">
    <div id="info" style="padding:8px"></div>
    <canvas id="cv"></canvas>
    <script type="module" src="/src/main.ts"></script>
  </body>
```

- [ ] **Step 2: Look at it**

Run: `npm run dev` and open `http://localhost:5173/rope-tangle/?seed=1&ropes=5`, then `?ropes=10`. Expected: every rope's polyline bends at least once around another rope's line, over-dots sit on the top rope, prev/next change the picture. Walk 5 seeds at 8 ropes without an error in the console.

- [ ] **Step 3: Typecheck, build, commit**

Run: `npm run typecheck && npm run lint && npm run build`

```bash
git add src/main.ts src/devpage index.html
git commit -m "feat: add a dev page that draws scrambled diagrams"
```

---

## Self-review notes

- Spec coverage: §6.1 (types, circle rim), §6.2 (move, midpoint placement, degeneracy nudging), §6.3 (queries; `reduce` deliberately omitted as optional), §6.4 (invariants as tests), §7.1 (recipe interface; arity fixed at 2 for this plan, generalization is a later content change), §7.2 (three recipes), §7.3 (scrambler, difficulty, retry). Not in this plan by design: §5 board, §8–§10, §9.1 hole fitting (belongs with `realize` in plan 2).
- The spec's `posA`/`posB` on crossings are not stored; positions are read from the vertex lists, which is simpler to keep consistent. The spec's `Crossing` interface should be read with that substitution; it does not change any behavior.
- Type names are consistent across tasks: `Diagram`, `RopeD`, `Vertex`, `Crossing`, `EndRef`, `EndPos`, `Gap`, `Move`, `Recipe`, `ScrambleLogEntry`, `Scrambled`, `Difficulty`.
