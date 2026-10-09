import { boardForRopes } from "../src/board";
import { assignHoles, buildLayout, pegs } from "../src/realize/fit";
import type { Layout } from "../src/realize/layout";
import { relax } from "../src/realize/relax";
import { fitSeed } from "../src/realize/realize";
import { scramble } from "../src/scramble/scramble";
import { mulberry32 } from "../src/util/rng";
import { relaxReference } from "./helpers/relax-reference";

function layoutFor(seed: number, n: number) {
  const { diagram } = scramble(seed, n);
  const board = boardForRopes(n);
  const holes = assignHoles(diagram, board, mulberry32(fitSeed(seed)));
  return { L: buildLayout(diagram, board, holes), pegList: pegs(board, holes) };
}

function copy(L: Layout): Layout {
  return { nodes: L.nodes.map((n) => ({ ...n })), ropes: L.ropes.map((r) => ({ nodes: [...r.nodes], labels: [...r.labels] })) };
}

describe("relax speed-up", () => {
  it("produces exactly the reference layout", () => {
    for (const n of [4, 7, 10]) {
      for (const seed of [1, 2, 3]) {
        const { L, pegList } = layoutFor(seed, n);
        const ref = copy(L);
        relax(L, 60, pegList);
        relaxReference(ref, 60, pegList);
        expect(L.nodes).toEqual(ref.nodes);
      }
    }
  }, 120_000);
});
