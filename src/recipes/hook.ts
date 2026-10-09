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
