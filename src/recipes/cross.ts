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
