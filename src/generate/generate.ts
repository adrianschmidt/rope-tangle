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
  const realizeOpts: RealizeOptions = { ...opts, monitor: opts.monitor ?? true };
  const dumps: string[] = [];
  let next = seed;
  for (let tries = 1; tries <= maxTries; tries++) {
    const s = scrambleWithRetry(next, ropes, difficulty);
    let realized: Realized | null = null, error: string | null = null;
    try {
      realized = run(s.diagram, board, s.seed, realizeOpts);
    } catch (e) {
      if (!(e instanceof RealizeFailed)) throw e;
      error = e.message;
    }
    if (realized && realized.agreement.ok && realized.passThroughs === 0) {
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
      passThroughs: realized?.passThroughs ?? 0,
    }));
    next = s.seed + 1;
  }
  throw new RealizeFailed(`no agreeing board in ${maxTries} tries from seed ${seed}`);
}
