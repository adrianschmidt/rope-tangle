import { DiagramDegenerate, cloneDiagram, createDiagram, hookedRopes, moveEnd, type Diagram } from "../diagram";
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
    const hooked = hookedRopes(d);
    if (applied >= difficulty.recipes && hooked.size === ropeCount) break;
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
    if (applied >= difficulty.recipes) {
      const focused = candidates.filter((c) => !hooked.has(c.a) || !hooked.has(c.b));
      if (focused.length > 0) candidates = focused;
    }
    while (candidates.length > 0) {
      const c = pickWeighted(rng, candidates, (x) => x.recipe.weight);
      const snap = cloneDiagram(d);
      try {
        const moves = c.recipe.apply(d, c.a, c.b, c.end);
        log.push({ recipe: c.recipe.name, a: c.a, b: c.b, end: c.end, moves });
        applied++;
        break;
      } catch (e) {
        if (!(e instanceof DiagramDegenerate)) throw e;
        Object.assign(d, snap);
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
