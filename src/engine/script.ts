import type { Board } from "../board";
import type { Point } from "../util/point";
import type { Engine } from "./engine";
import { settle } from "./settle";

export function insetPoint(board: Board, P: Point, d: number): Point {
  const cx = board.width / 2, cy = board.height / 2;
  const dx = cx - P.x, dy = cy - P.y, l = Math.hypot(dx, dy);
  return { x: P.x + (dx / l) * d, y: P.y + (dy / l) * d };
}

export function scriptedMove(E: Engine, rope: number, end: 0 | 1, toHole: number, settleMax = 800): void {
  const from = E.rope(rope).ends[end];
  if (from === null) throw new Error(`scriptedMove: rope ${rope} end ${end} is not in a hole`);
  const A = E.hole(from), B = E.hole(toHole);
  E.grab(rope, end);
  const path = [insetPoint(E.board, A, 24), insetPoint(E.board, B, 24), { x: B.x, y: B.y }];
  let guard = 0;
  for (const T of path) {
    while (guard++ < 20000) {
      E.substep(T);
      const c = E.endPoint(rope, end);
      if (E.held?.lifted && Math.hypot(T.x - c.x, T.y - c.y) < 1e-6) break;
    }
  }
  E.attach(toHole);
  settle(E, settleMax);
}
