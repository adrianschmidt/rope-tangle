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
