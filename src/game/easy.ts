import { rimBoard } from "../board";
import { Engine } from "../engine/engine";
import { settle } from "../engine/settle";
import type { P3 } from "../engine/types";

function bow(ax: number, ay: number, bx: number, by: number, peak: number): P3[] {
  const pts: P3[] = [];
  for (let k = 0; k <= 40; k++) {
    const t = k / 40;
    pts.push({ x: ax + (bx - ax) * t, y: ay + (by - ay) * t, z: peak * Math.sin(Math.PI * t) });
  }
  return pts;
}

export function easyBoard(): Engine {
  const board = rimBoard(4, 5), E = new Engine(board);
  const at = (x: number, y: number): number => {
    const i = board.holes.findIndex((h) => h.x === x && h.y === y);
    if (i < 0) throw new Error(`easyBoard: no hole at ${x},${y}`);
    return i;
  };
  E.addRope(bow(0, 0, 192, 256, 4), [at(0, 0), at(192, 256)]);
  E.addRope(bow(192, 0, 0, 256, -4), [at(192, 0), at(0, 256)]);
  settle(E);
  return E;
}
