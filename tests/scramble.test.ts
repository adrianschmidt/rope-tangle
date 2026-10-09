import { DiagramDegenerate, moveEnd, reduce } from "../src/diagram";
import { cross, flipGap, hook, type Recipe } from "../src/recipes";
import { checkConsistent, hookedRopes } from "../src/diagram/queries";
import { deck } from "../src/recipes/deck";
import { ScrambleFailed, defaultDifficulty, replay, scramble, scrambleWithRetry } from "../src/scramble/scramble";

describe("scramble", () => {
  it("hooks every rope and applies at least the requested recipes", () => {
    for (const n of [4, 5, 8, 10]) {
      for (let seed = 1; seed <= 15; seed++) {
        const { diagram, log } = scramble(seed, n);
        expect(hookedRopes(reduce(diagram)).size).toBe(n);
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
    expect(() => scramble(1, 2, { recipes: 1, maxRecipes: 1 }, [])).toThrow(ScrambleFailed);
  });

  it("leaves no trace of a recipe that fails partway", () => {
    let calls = 0;
    const failing: Recipe = {
      name: "failing",
      weight: 1,
      match: () => true,
      apply(d, a, b, end) {
        calls++;
        moveEnd(d, a, end, flipGap(d, { rope: a, end }, b));
        throw new DiagramDegenerate("fails after one move");
      },
    };
    const { diagram, log } = scramble(1, 4, { recipes: 4, maxRecipes: 16 }, [cross, hook, failing]);
    expect(calls).toBeGreaterThan(0);
    expect(log.some((e) => e.recipe === "failing")).toBe(false);
    expect(replay(4, log)).toEqual(diagram);
  });

  it("retries seeds and reports the one that worked", () => {
    const r = scrambleWithRetry(5, 4);
    expect(r.seed).toBeGreaterThanOrEqual(5);
    expect(hookedRopes(r.diagram).size).toBe(4);
    expect(() => scrambleWithRetry(1, 2, { recipes: 1, maxRecipes: 0 }, 3)).toThrow(ScrambleFailed);
  });

  it("uses the default difficulty", () => {
    expect(defaultDifficulty(7)).toEqual({ recipes: 7, maxRecipes: 28 });
    expect(deck.map((r) => r.name)).toEqual(["cross", "hook", "twist2", "twist3"]);
  });
});
