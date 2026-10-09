# Realize measurements (plan 2, Task 10)

Machine: Mac mini (Apple silicon), Node 22, branch `plan2-engine-realize`.
Command: `SEEDS=20 npm run measure` (20 scrambles per rope count, scramble seeds 1000, 2000, …, 20000).

Tension is off during the inflation ramp (ruling in Task 7), so the plan's z-tension on/off comparison collapsed into one setting.

| Ropes | Agree | Fit failures | Monitor flags per board | Median crossing spacing after spreading | ms per board (with monitor) | ms per substep |
|---|---|---|---|---|---|---|
| 4 | 16/20 | 0 | 5.4 | 11.6 | 237 | 0.155 |
| 5 | 15/20 | 0 | 18.2 | 11.3 | 436 | 0.236 |
| 6 | 12/20 | 0 | 22.5 | 11.3 | 700 | 0.295 |
| 7 | 4/20 | 0 | 31.8 | 11.3 | 1083 | 0.402 |
| 8 | 7/20 | 0 | 42.8 | 11.5 | 1517 | 0.534 |
| 9 | 8/20 | 0 | 58.7 | 11.2 | 2243 | 0.680 |
| 10 | 5/20 | 0 | 66.8 | 11.5 | 3124 | 0.816 |

Without the monitor, realizing a 10-rope board took 1.9–3.7 s (three seeds).

## After the physics debugging (same command, same seeds)

| Ropes | Agree | Fit failures | Monitor flags per board | of which pass-throughs (sign-sum changes) | Median crossing spacing after spreading | ms per board (with monitor) | ms per substep |
|---|---|---|---|---|---|---|---|
| 4 | 20/20 | 0 | 0 | 0 | 11.2 | 263 | 0.147 |
| 5 | 20/20 | 0 | 0 | 0 | 11.0 | 475 | 0.232 |
| 6 | 20/20 | 0 | 0 | 0 | 11.3 | 770 | 0.289 |
| 7 | 20/20 | 0 | 0 | 0 | 11.2 | 1165 | 0.386 |
| 8 | 20/20 | 0 | 1.6 | 0 | 11.4 | 1652 | 0.511 |
| 9 | 20/20 | 0 | 0.05 | 0 | 11.2 | 2448 | 0.646 |
| 10 | 20/20 | 0 | 0 | 0 | 11.6 | 3354 | 0.808 |

Without the monitor, realizing a 10-rope board took 2.2–4.3 s (three seeds).

The remaining flags at 8 and 9 ropes are the monitor's documented false positive: two ropes running alongside each other make crossing pairs appear and vanish together, interleaved with another crossing in one rope's order. Their sign sums never change.

## What was actually wrong

None of the three suspected causes below was the main story. The three dumped 4-rope boards contain no pass-through at all: every per-pair sum of crossing signs is the same at placement, after the ramp and at rest.

1. **The agreement check rejected legal motion.** Comparing label sequences along one rope after cancelling adjacent equal labels is not invariant: a slack bight twists and its self-crossing slides across the other rope (Reidemeister III), which reorders a pair's crossings along one rope ("hook turned inside out", "same crossings in a different order"), and adjacent equal labels along one rope are only a bigon if adjacent along the other. `compare` now requires equal sums of crossing signs per pair (twice the linking number) plus the same cyclic order of ends.
2. **Crossings placed exactly on a particle of both ropes broke the readout.** The chains put the shared crossing node as a particle on both ropes, and both chains bent there. `segCross`'s half-open parameter test then counted the crossing twice or not at all depending on rounding (8 % of such cases), and the sign taken from one outgoing segment was wrong at sharp bends. These produced the "5–67 flags per board": phantom duplicates during the ramp, not pass-throughs. Fixed in placement (each rope runs straight through its crossings, crossing mid-segment on both ropes) and in the readout (parameters within 1e-9 of 0 or 1 snap).
3. **Pegs (suspected cause 2) was real but rare.** Extension sweeps reached the rim, so a sweep passing an occupied hole late ran inside that peg; the peg shoved the thin rope across a neighbor during the first ramp substeps (one 5-rope board in 35). Fixed in the layout: sweeps end on a ring inset by `POST_R + 4` and go radially to the hole, and the spread keeps edges out of foreign peg discs.

Suspected causes 1 (heights between crossings) and 3 (spacing below rope width) produced no pass-through in any measured board and were not changed.

## Decision (before the debugging)
Agreement is far below the plan's bar (19/20 for every rope count). Per the plan, nothing was tuned; this is reported with dumps.

Fitting and spreading are not the problem: every board produced a valid layout, and spreading reached the same spacing at every rope count. The losses happen in the physics, while the ropes inflate and settle: the pass-through monitor flags many changes per board that no legal motion produces, and the flag count grows with the number of ropes.

## What the disagreements look like

From the failing 4- and 5-rope boards (reduced sequences, rope a's view):

- Same crossings in a different order: diagram `over, under, over, under`, physics has four crossings that reduce to nothing (adjacent labels became equal), and the reverse.
- A hook turned inside out: diagram `under, over`, physics `over, under`.
- Crossings lost or gained in a pass-through: diagram `under, over, under`, physics `over`.

All three require one rope passing through another.

## Dumps

`dumps/4-ropes-seed-4000.json`, `dumps/4-ropes-seed-6000.json`, `dumps/4-ropes-seed-10000.json`: one disagreeing 4-rope board each, as written by `generateBoard`. Each reproduces exactly with `realize(diagramFromJson(dump.diagram), boardForRopes(4), dump.seed)`.

## Likely causes to investigate next

1. **Heights between crossings.** Heights are interpolated linearly between crossings, so a rope can be near height 0 a few units from a crossing where it must be at ±8. Where two ropes pass close in xy there, the growing contacts push mostly sideways and can let the wrong rope end on top.
2. **Pegs.** Peg pushes ignore contacts (capped at 2 units per iteration, as in the prototype) and can shove a rope through another near the rim, where the extensions run close together.
3. **Spacing below rope width.** Spreading leaves neighboring crossings about 11.5 units apart, below the contact distance of 16, so inflation has to move crossings while they are still thin.

Each of these is testable with the dumps above and the monitor's flag log (`Monitor.log` records the substep and the pair).
