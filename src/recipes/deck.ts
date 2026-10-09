import { cross } from "./cross";
import { hook } from "./hook";
import { twist } from "./twist";
import type { Recipe } from "./types";

export const deck: Recipe[] = [cross, hook, twist(2, 1), twist(3, 0.5)];
