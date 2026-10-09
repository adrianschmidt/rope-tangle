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
    match: (d, a, b, end) => hook.match(d, a, b, end),
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
