import { boardForRopes } from "../src/board";
import { GRAB_RADIUS } from "../src/game/session";
import { fitView } from "../src/render/ropes";

describe("fitView", () => {
  it("keeps every grab zone out of the side gap on a narrow phone", () => {
    for (let n = 4; n <= 10; n++) {
      const board = boardForRopes(n), v = fitView(board, 390, 796, 32);
      for (const h of board.holes) {
        expect(v.ox + (h.x - GRAB_RADIUS) * v.s).toBeGreaterThanOrEqual(32);
        expect(v.ox + (h.x + GRAB_RADIUS) * v.s).toBeLessThanOrEqual(390 - 32);
      }
    }
  });

  it("costs nothing when the height limits the board", () => {
    const board = boardForRopes(10);
    expect(fitView(board, 1200, 600, 32)).toEqual(fitView(board, 1200, 600));
  });
});
