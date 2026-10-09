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
      passThroughs: r.passThroughs,
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

  it("monitors realization by default and lets the caller turn it off", () => {
    const seen: (boolean | undefined)[] = [];
    const spy: typeof realize = (d, board, seed, opts) => {
      seen.push(opts?.monitor);
      return realize(d, board, seed, opts);
    };
    generateBoard(1, 4, { realizeImpl: spy });
    generateBoard(1, 4, { realizeImpl: spy, monitor: false });
    expect(seen[0]).toBe(true);
    expect(seen[seen.length - 1]).toBe(false);
  });

  it("treats a pass-through seen during realization as a disagreement", () => {
    let calls = 0;
    const leaky: typeof realize = (d, board, seed, opts) => {
      const r = realize(d, board, seed, opts);
      return calls++ === 0 ? { ...r, passThroughs: 1 } : r;
    };
    const g = generateBoard(11, 4, { realizeImpl: leaky });
    expect(g.tries).toBe(2);
    const dump = parseDump(g.dumps[0]!);
    expect(dump.stage).toBe("physics");
    expect(dump.passThroughs).toBe(1);
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
