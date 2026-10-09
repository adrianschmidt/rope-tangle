import { boardForRopes } from "../src/board";
import { cloneDiagram, createDiagram, type Diagram } from "../src/diagram";
import { D } from "../src/engine/constants";
import { compare } from "../src/realize/compare";
import { assignHoles, buildLayout } from "../src/realize/fit";
import { chainPoints, crossingRadii } from "../src/realize/place";
import { realize } from "../src/realize/realize";
import dump4000 from "../docs/superpowers/notes/dumps/4-ropes-seed-4000.json?raw";
import dump6000 from "../docs/superpowers/notes/dumps/4-ropes-seed-6000.json?raw";
import dump10000 from "../docs/superpowers/notes/dumps/4-ropes-seed-10000.json?raw";
import { diagramFromJson, parseDump } from "../src/generate/dump";
import { cross, hook } from "../src/recipes";
import { scrambleWithRetry } from "../src/scramble/scramble";
import { relax } from "../src/realize/relax";
import { linking, pairSequence } from "../src/diagram";
import { Engine } from "../src/engine/engine";
import { pairKey } from "../src/engine/types";
import { mulberry32 } from "../src/util/rng";

function hooked(): Diagram {
  const d = createDiagram(4);
  cross.apply(d, 0, 1, 1);
  hook.apply(d, 1, 0, 0);
  return d;
}

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

describe("chainPoints", () => {
  it("runs each rope straight through its crossings so the chains read exactly like the diagram", () => {
    for (const n of [4, 7, 10]) {
      for (const seed of [1000, 2000]) {
        const s = scrambleWithRetry(seed, n), board = boardForRopes(n);
        const holes = assignHoles(s.diagram, board, mulberry32(seed));
        const L = buildLayout(s.diagram, board, holes);
        relax(L);
        const E = new Engine(board), radii = crossingRadii(L);
        L.ropes.forEach((_, i) => E.addRope(chainPoints(L, i, radii), [holes[i * 2]!, holes[i * 2 + 1]!]));
        const sig = E.signature();
        for (let a = 0; a < n; a++) {
          for (let b = a + 1; b < n; b++) {
            const list = sig.get(pairKey(a, b)) ?? [];
            expect([n, seed, a, b, list.length]).toEqual([n, seed, a, b, pairSequence(s.diagram, a, b).length]);
            expect([n, seed, a, b, list.reduce((t, c) => t + c.sign, 0)]).toEqual([n, seed, a, b, linking(s.diagram, a, b)]);
          }
        }
      }
    }
  }, 30_000);
});

describe("realize", () => {
  it("realizes a hook so that the physics agrees with the diagram", () => {
    const r = realize(hooked(), boardForRopes(4), 1);
    expect(r.agreement.orderOk).toBe(true);
    expect(r.agreement.ok).toBe(true);
    const pair = r.agreement.pairs.find((p) => p.a === 0 && p.b === 1)!;
    expect(Math.abs(pair.linkDiagram)).toBe(2);
    expect(pair.linkPhysical).toBe(pair.linkDiagram);
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

  it("accepts dumped boards whose crossings only slid past each other legally", () => {
    for (const text of [dump4000, dump6000, dump10000]) {
      const dump = parseDump(text);
      const r = realize(diagramFromJson(dump.diagram), boardForRopes(4), dump.seed);
      expect(r.agreement.ok).toBe(true);
    }
  });

  it("is deterministic", () => {
    const a = realize(hooked(), boardForRopes(4), 5), b = realize(hooked(), boardForRopes(4), 5);
    expect(a.engine.ropes.map((r) => r.pts)).toEqual(b.engine.ropes.map((r) => r.pts));
  });
});
