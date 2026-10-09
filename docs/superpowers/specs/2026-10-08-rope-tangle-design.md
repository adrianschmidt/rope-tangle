# Rope Tangle — design spec

Date: 2026-10-08 (revised 2026-10-09, §9 revised for plan 2)
Status: reviewed by Adrian; revisions applied
Repo: `adrianschmidt/rope-tangle` (the prototypes live in `spike/`; this spec describes the real game)

## 1. Goal

A browser puzzle game in the style of "Rope Escape Master": ropes are strung between pegs on a board and tangled around each other; the player untangles them by moving rope ends to free holes. No timer, no ads, no pressure.

The player (Adrian) plays while listening to audiobooks, so the game must be solvable by looking alone: no reading, counting, or multi-step verbal reasoning. Difficulty comes from how rich the tangle is to read, never from deduction depth.

## 2. Rules

- The board is a rectangle with holes along its rim. A hole is either empty or holds a peg with a rope end attached.
- Each rope runs from one peg to another. Ropes are thick, taut, elastic and frictionless. They lie over and under each other, bend only where they hook or twist around another rope or wrap around a peg, and settle where forces balance.
- A move: pick up a rope end, drag it, release it. The picked-up end is lifted above everything, so the lifted stretch of rope passes over every other rope. On release the end drops into the nearest free hole (the hole it came from counts as free). A move is counted when the end lands in a different hole than it came from.
- Empty holes are not obstacles. A peg with a rope end attached is an obstacle: ropes bend around it on the board side.
- A rope that crosses nothing (viewed from above) and is not being moved disappears from the board. The board is solved when no ropes remain.
- Any rope end may be picked up at any time, including while a previously released end is still travelling to its hole, except an end of a rope that is itself still travelling or landing.
- There is no par, no stars, no time limit. A move counter is shown and can be hidden in settings.

## 3. Scope of the first release

In: one board type (holes on the rim only), rope counts 4–10 chosen by the player, endless generated boards, move counter with hide toggle, PWA install, GitHub Pages deploy.

Out (designed for, not built): other hole layouts (filled grids, 2×2 islands), curated levels, par/stars, undo, sound, more tangle recipes. See §12.

## 4. Architecture

Modern TypeScript + Vite + PWA + canvas 2D, tests with vitest, toolchain versions as in the `puzzle` game. No framework.

Modules, each a directory under `src/`:

| Module | Responsibility | Depends on |
|---|---|---|
| `board` | Hole layout as data; rim parametrization | — |
| `diagram` | Abstract tangle: ropes as polylines with over/under crossings; the move operation; queries | — |
| `recipes` | Named tangle patterns: match against a diagram, emit moves | `diagram` |
| `scramble` | Builds a diagram from a seed, rope count and difficulty | `diagram`, `recipes` |
| `engine` | Physics: thick ropes with height, contacts, pegs, held/flying/landing ends; crossing readout | `board` |
| `realize` | Fits a diagram to the board's holes, turns it into an engine state, checks agreement | `diagram`, `engine`, `board` |
| `generate` | One playable board from a seed: scramble, realize, retry the next seed on disagreement, debug dumps | `scramble`, `realize` |
| `render` | Draws board, ropes, handles | `engine`, `board` |
| `game` | Input, phases, clearing, win, settings, generation in a worker | all |

Data flow for a new board: `generate` (in a Web Worker) runs `scramble` (pure, fast, no board knowledge) → `realize` (hole fitting, spreading, physics settle) → `game` receives the engine state → play.

## 5. Board (`board`)

```ts
interface Hole { x: number; y: number; rim: number; ox: number; oy: number }
interface Board { width: number; height: number; holes: Hole[]; rimLength: number }
```

- `rim` is the hole's position along the rim, measured clockwise from the top-left corner, in board units. `ox, oy` is the outward normal (diagonal at corners).
- The rim-only generator makes a `cols × rows` grid with 64-unit pitch and holes on the perimeter only. Size by rope count: 4→4×5, 5→4×6, 6→5×6, 7→5×7, 8→6×7, 9→6×8, 10→7×8 (holes ≥ 2 × ropes + 4 in every case).
- `rimPoint(board, t)` maps a rim parameter `t ∈ [0, rimLength)` to a point on the rectangle; `rimOf(board, hole)` is its inverse for holes.
- The layout is data so that later board types only add generators. Nothing else in the game may assume holes are on the rim except the diagram's circular rim (§6), the hole fitting (§9.1) and the engine's peg obstacle shape (§8.3).

## 6. Diagram (`diagram`)

The abstract tangle. No physics, no thickness. Everything the scrambler and recipes need is answered here.

### 6.1 Data

```ts
interface Vertex { x: number; y: number; kind: 'end' | 'fold' | 'crossing'; crossing?: Crossing }
interface RopeD { id: number; vertices: Vertex[] }          // vertices[0] is end 0, last is end 1
interface Crossing { id: number; a: number; b: number; over: number; posA: number; posB: number }
interface Diagram { ropes: RopeD[]; crossings: Map<number, Crossing>; ends: EndPos[] }
interface EndPos { rope: number; end: 0 | 1; angle: number }  // position on the unit circle
```

- The diagram's rim is the unit circle and all geometry lives inside it. Holes, pegs and the board rectangle do not exist here; `realize` maps the disc onto the board (§9.1).

- A rope is a polyline. Crossing vertices appear in both ropes' vertex lists (sharing one `Crossing` record). `posA`/`posB` are the crossing's index positions along each rope, kept consistent after every edit.
- `over` names the rope on top. A crossing may be a self-crossing (`a === b`); self-crossings are kept for correctness but never count as "crossing something" for the clearing rule.
- `fold` vertices are plain route points with no topological meaning (§9.1 uses them).
- Geometry is deliberately allowed to be ugly. Correctness depends only on: every vertex sequence is a valid polyline, segments intersect only at recorded crossings, and `over` labels are right. The physics straightens everything later.

### 6.2 The move

`moveEnd(diagram, rope, end, gap)` moves one rope end into a gap of the cyclic order (between two named neighboring ends, or the gap an end leaves behind), as the game's physical move would. The end is placed at the midpoint of that gap on the circle; no other position is ever used, so the operation is deterministic and needs no random input.

1. Walk from the moved end back along the rope to the nearest crossing where this rope is **under**. Everything beyond it (toward the moved end) is the lifted stretch. If there is none, the whole rope is lifted.
2. Delete every crossing on the lifted stretch (from both ropes' vertex lists). Delete the lifted vertices.
3. Append one straight segment from the hold-down vertex (the under-crossing, or the other end) to the gap midpoint on the circle, and set the end's angle.
4. Intersect the new segment with every segment of every rope, including the retained part of this rope. Each intersection becomes a crossing with `over = rope`, inserted into both polylines at the right positions.
5. Degeneracies: if the new segment passes exactly through an existing vertex or meets another segment at its endpoint, nudge the angle by a fixed tiny fraction of the gap and retry (bounded retries, then throw `DiagramDegenerate`). Gaps are allowed to become arbitrarily small; the abstract spacing of ends carries no meaning, because holes are assigned by cyclic order only (§9.1).

Why this is right: a lifted end passes over everything, and with all ends on the rim the result of a move depends only on where the end lands in the cyclic order of ends, not on the path or the current shape of the ropes. So any valid planar drawing gives a topologically correct result, and step 4 records every side effect on uninvolved ropes exactly, since it intersects the new segment with all of them.

### 6.3 Queries

- `pairSequence(d, a, b, fromEnd)`: labels (`'over' | 'under'` from `a`'s point of view) of the crossings between `a` and `b`, ordered along `a` from the given end.
- `isHooked(d, a, b)`: the pair sequence contains both labels.
- `hookedRopes(d)`: ropes hooked with at least one other rope.
- `crossingCount(d, rope)`: crossings with other ropes (self-crossings excluded).
- `cyclicOrder(d)`: ends sorted by angle.
- `liftedStretch(d, rope, end)`: the crossings a move of that end would remove (the step-1 walk). Recipes use it to reason about what a move will and won't undo.
- `reduce(d)`: a copy with crossing pairs removed that are adjacent along both ropes with the same `over` (bigons, which are topologically nothing). The scrambler makes its hook decisions (`match`, `hookedRopes`) on this view, so a bigon never counts as a hook. The live diagram is never reduced, because its geometry would then hold intersections with no crossing record.

### 6.4 Invariants (tested)

- After any sequence of moves, for every pair of ropes the parity of their crossing count equals whether their ends alternate around the rim.
- Replaying a move log on a fresh diagram reproduces the same diagram.
- Moving an end back into the gap it came from, when the lifted stretch had only over-crossings created by the previous move, restores the previous pair sequences up to `reduce` (undo property; the straight return segment can add bigons).

## 7. Recipes and scrambling (`recipes`, `scramble`)

### 7.1 Recipe

```ts
interface Recipe {
  name: string;
  arity: number;                               // ropes involved
  weight: number;                              // deck weight
  match(d: Diagram, ropes: number[]): Binding | null;
  apply(d: Diagram, b: Binding): void;             // calls moveEnd one or more times
}
```

- A `Binding` names the involved ropes and which of their ends are running ends (will be moved) and standing ends (will not). An end attached to the rim can play either role; a recipe never moves anything but a running end at the rim.
- `match` is purely combinatorial: cyclic order of the involved ends (up to rotation and mirroring) plus the pair sequences the recipe requires. It ignores uninvolved ropes.
- Move targets are **gaps** between named ends in the cyclic order, never holes or absolute positions. `apply` is deterministic given the binding.
- Side effects on uninvolved ropes (extra crossings, accidental hooks) are allowed and welcome. They are not special-cased anywhere: `moveEnd` records them exactly like any other crossing, so the diagram stays a complete record of the tangle. Recipes do not verify anything.

### 7.2 Initial deck

1. **Cross** (2 ropes, 1 move). Precondition: the ropes' ends do not alternate around the rim. Move A's running end so that they do. Result: A over B once. Sets up later hooks.
2. **Hook** (2 ropes, 1 move). Precondition: the crossing of A with B nearest A's running end is `under`, and A's lifted stretch contains no `under` crossing with B (guaranteed by the walk). Move A's running end so that the A/B ends stop alternating. Result: A passes under B then over it: A is hooked on B.
3. **Twist** (2 ropes, N moves, N ∈ {2, 3}). Hook A on B, then move B's running end across A's new segment (B is under A there, so it hooks back), alternating, N times. Result: the two ropes wind around each other.

Recipes are data plus two functions; adding one is a content change. Candidates for later: hook-through (a rope that already runs under a hook's loop is then moved over), chain (A on B on C), weave (over–under across several ropes).

### 7.3 Scrambler

```ts
scramble(seed: number, ropeCount: number, difficulty: Difficulty): { diagram: Diagram; log: Move[] }
```

1. Seeded RNG (mulberry32 as in the spike). Place `2 × ropeCount` ends evenly around the circle and pair neighboring ends into ropes, so the start has no crossings. The RNG is used only to choose among matching recipes.
2. Loop:
   - Enumerate all (recipe, rope tuple) pairs whose `match` succeeds.
   - Pick one at random, weighted by recipe weight; apply it; append its moves to the log.
   - Stop when every rope is hooked (`hookedRopes(d)` is all ropes) **and** at least `difficulty.recipes` recipes have been applied. Give up after `difficulty.maxRecipes` and retry with the next seed (counted in telemetry during development; must be rare).

`Difficulty` for the first release is derived from rope count only: `recipes = ropeCount`, `maxRecipes = 4 × ropeCount`. The deck and its weights are the knobs for later difficulty settings.

## 8. Engine (`engine`)

A port of the second prototype (`spike/index.html`), restructured into typed modules. The prototype's behavior and constants are the reference; this section lists what must hold.

### 8.1 Model

- Each rope is a chain of particles `{x, y, z}` with previous positions for Verlet integration, spaced `H0 = 8` units apart (resampled when the spacing drifts outside 0.8–1.25 × H0 or any segment exceeds 1.8 × H0).
- Tension: each interior particle moves toward the midpoint of its neighbors by `OMEGA = 0.5` per iteration, in x, y and z. Constant tension across ropes follows from equal spacing. (0.5 is deliberate: larger values cause period-2 vibration at contacts.)
- Contacts: segment–segment closest points in 3D; any two segments of different ropes, or of the same rope at least `SELF_GAP = 4` segments apart, are pushed to a centerline distance of `D = 16` (rope visual width 12 plus outline 3, plus margin). Position-based, inverse masses proportional to segment length, pinned ends immovable.
- No floor. Ends sit at z = 0; everything else floats where tension and contacts put it. Over/under at a crossing is whichever rope is higher there.
- Per substep: `ITER = 8` iterations of tension → pegs → contacts; velocities damped by `DAMP = 0.9`, cut to zero below `VCUT = 0.3` units/substep (kills contact jitter), capped at `VMAX = 2.5`; displacement per substep capped at `DMAX = 4`.
- Collision search: uniform grid over segment bounding boxes including z, rebuilt every substep without allocations (pooled segment records, typed arrays); candidate pairs filtered by exact distance into hot (< D + 1) and warm (< D + 3) lists; warm pairs are checked every second iteration; the lists are refreshed once mid-substep.

### 8.2 Ends

- **Held**: follows the pointer target at `STEP = 3` units/substep in xy, and rises to `max(LIFT = 45, highest other-rope particle within 30 units + CLEARANCE = 38)`. It only starts moving in xy once lifted. A vertical blocker segment above the held end stops ropes resting on the lifted stretch from slipping over the end.
- **Flying**: a released end keeps a path (pointer position, then the hole) and a target hole; it is driven like a held end and lands when it arrives. Several ends may fly at once.
- **Landing**: the end snaps to the hole in xy, keeps its blocker, waits (up to 40 substeps) until no other rope particle lies inside the peg radius below it, then descends at `STEP` per substep to z = 0.

### 8.3 Pegs

A hole with an end attached is an obstacle for all other ropes: a capsule of radius `POST_R = 25` from the hole centre extending outward through the rim, so ropes always pass on the board side. Pushes are capped at 2 units per iteration (hard pushes caused pass-throughs in the prototype). A held rope ignores pegs while its particles are above `POST_H = 38`, and ignores its origin hole until lifted.

### 8.4 Readout

- `signature()`: crossings from the xy projection of the current state, with over/under by height and the crossing's sign (+1 when the under strand runs left to right as seen along the over strand), grouped per rope pair and ordered along each rope. Computed on demand (cheap) and used by clearing (§10.4), by `realize` (§9) and by tests.
- Dev-only **pass-through monitor**: compares successive signatures and flags any change that cannot come from a legal move (a label flip, a pair appearing with opposite labels, a crossing appearing or vanishing away from a free rope). It has known false positives when crossings stack on one spot; it is a test instrument, not game logic.

### 8.5 Performance budget

Measured on the Mac mini with the prototype: 0.03–0.14 ms per substep on fresh boards, 0.38 ms on a 54-crossing tangle. The game must keep: handle follows the finger instantly (§10.2), rope catches up within 1 s on an 8-rope board on a mid-range phone, settle after drop under 1 s. The frame loop gives physics a time budget (`14 ms − last render time`, clamped to 4–11 ms) and runs at least two substeps per frame.

## 9. Realization (`realize`)

Turns a scrambled diagram into a settled engine state. This is the only place where holes, pegs and the board rectangle meet the diagram, and the only place randomness touches geometry.

### 9.1 Fitting to the board

Scrambled diagrams are cramped: in 10-rope scrambles the median distance between neighboring crossings along a rope is about 0.002 of the disc radius (under half a board unit), and the smallest is about 1e-5. Ends can sit within 0.01 radians of each other. Fitting therefore does three things: it pins ends to holes, it connects the diagram to them without changing its topology, and it spreads the result out so the physics starts from rope-scale features.

1. **Holes.** Assign ends to holes with a random monotone assignment (seeded): a random set of holes, taken in rim order, rotated to best match the ends' angles. Same cyclic order, one hole per end, the empty holes spread at random among the gaps. This is where the jitter in end placement lives.
2. **Embed and extend.** Place the diagram unchanged as a disc in the middle of the board (radius 0.6 of half the board's shorter side), so its straight segments stay straight. Extend each rope from the point where it meets the disc's edge out to its hole: the extension's angle moves linearly from the end's angle to the hole's angle while its radius moves linearly from the disc's edge to a ring inset from the rim by `POST_R + 4` (the board rectangle shrunk by that much), and from the ring it runs straight out along the hole's radial. The hole angles are unwrapped so they increase around the circle like the end angles and span less than one turn. Then, at every stage of the sweep, all extensions sit on the same ring in the same order, so no two extensions meet and none enters the disc; and no extension comes within a peg's radius of another rope's hole, which a sweep that reached the rim did whenever it passed an occupied hole late (the peg then shoved the still thin rope across its neighbors). The extensions are sampled into a straight-line drawing (a *layout*: one node per crossing shared by both strands, bend nodes, end nodes fixed at holes). The layout is checked: no two edges meet except at shared nodes, and at every crossing node the two strands still alternate around it. If the check fails, the extensions are sampled twice as finely; after six refinements realization fails with a dump.
3. **Spread.** Relax the layout while keeping its topology: each free node moves toward the average of its neighbors plus a short-range push away from nodes closer than `D` and away from other ropes' pegs closer than `POST_R + 4`, no step exceeds 0.45 of the node's distance to the nearest edge it is not part of, and a step is accepted only if it keeps the layout valid, sweeps over no other node, and brings no edge of the node closer than `POST_R` to another rope's peg than it already was. Steps that fail are halved once, then skipped.

### 9.2 Place and inflate

1. For each rope, build the particle chain along the spread layout at no more than `H0` spacing. Bend nodes become particles. A crossing node does not: both ropes get a particle at the same arc distance `δ` before and after it instead, with `δ = min(H0/2, a third of the shortest edge at the node, half the distance to the nearest edge not at the node)`. Each rope then runs straight through the crossing, the two chords must cross (their four ends lie on one circle around the node, in alternating order), and the crossing lies mid-segment on both ropes, where the readout counts it once with its true sign. A particle exactly at a bending crossing vertex of both ropes was counted twice or not at all depending on rounding, and the sign taken from a single outgoing segment was wrong at sharp bends.
2. Heights: the two particles flanking a crossing are at `+8` on the over strand and `−8` on the under strand (half the final contact distance); interpolate linearly in arc length between them; ends at 0.
3. Create the engine with contact distance 0, resampling off and tension off, then run 150 substeps while growing the contact distance linearly to `D = 16`, so the ropes only thicken in place. Then turn tension and resampling on and settle to rest (net movement over an 8-substep window below 0.15 units, or 800 substeps). The heights already encode every crossing's order, and nothing starts penetrated, so contacts never have to guess which way to push. Tension must stay off during the ramp: with it on, a taut loop slides through the rope it hooks before the ropes have any thickness (seen on the very first hand-built hook).
4. Compare the engine's signature with the diagram (§9.3).

### 9.3 Agreement check and debug dump

For each rope pair, require the sum of crossing signs (`linking` in the diagram, twice the linking number) to be the same in the physics as in the diagram; also require identical cyclic order of ends. The sum of signs is invariant under every motion the physics may legally perform, and a pass-through changes it by 2. Comparing the pair's label sequences does not work: legal motion reorders crossings along a rope (a slack bight twists and its self-crossing slides across the other rope, so a hook reads `under, over` from one side and `over, under` from the other), and adjacent equal labels along one rope are not a bigon unless they are also adjacent along the other. The check is deliberately weaker than isotopy: a strand passing through both legs of a bight at once is not caught; generation therefore runs the pass-through monitor (§8.4) through every realization (about 15 % of realize time) and treats any pass-through it sees as a disagreement too. Neither check looks at a rope passing through itself.

On disagreement there is no fallback. The game writes a debug dump and generates a fresh board with the next seed so play continues. The dump is a single JSON text containing everything needed to reproduce the case offline: app version, seed, rope count, difficulty, deck version, the move log, the diagram, the physical signature, the per-pair comparison, the number of pass-throughs the monitor saw, and the engine constants. It is logged to the console and, in development builds, shown in a copyable text box; in production it is kept in memory and shown on request from the settings panel, so Adrian can copy it and send it for debugging. The check and the dump stay until testing shows the fast path agrees reliably enough to remove them.

## 10. Game (`game`, `render`)

### 10.1 Screen

One screen. Top bar: rope count (4–10), New, settings (toggle move counter), move counter. Board below, letterboxed to fit. Win overlay: "Solved · N moves" (or just a tick when the counter is hidden) and a Next button. No other text during play.

### 10.2 Input

- Pointer down within 1.5 peg radii of a pinned, non-travelling rope end grabs it. The handle (a peg drawn at the finger) follows the pointer instantly; a straight tether of rope is drawn from the physical end to the handle while the physics catches up. The physical end chases the pointer in a straight line.
- Pointer up releases: target = nearest free hole to the pointer (holes reserved by flying ends excluded); the end flies via the pointer position to the hole. Move counter increments if the hole differs from the origin. The hole that would be chosen is highlighted while dragging.
- Any other eligible end can be grabbed immediately.

### 10.3 Phases

`idle` (physics asleep) → `held` → `busy` (physics running: flying, landing, settling) → `idle`. Grabbing is allowed in `idle` and `busy`. The physics sleeps only when nothing is held, flying or landing and the drift is below threshold (or after 240 frames).

### 10.4 Clearing

A rope clears when it has crossed nothing for 4 consecutive frames while nothing is held, flying or landing (so lifting a rope cannot clear others). Cleared ropes fade out over ~20 frames. When no ropes remain, show the win overlay.

### 10.5 Rendering

Canvas 2D, device pixel ratio capped at 2. Ropes are flat ribbons (width 12, dark outline 1.5) drawn in painter's order by height: each rope is cut into pieces at its particles, pieces sorted by quantized height, consecutive pieces of one rope at the same height merged into one stroke. Pieces are extended by 0.75 units at their ends to hide seams. Pegs are discs; empty holes are pale discs. The held/flying handle is drawn on top with a shadow. Ten distinct rope colors, assigned by `game` when a board is loaded (the diagram and the engine know nothing about color).

### 10.6 Generation and settings

- `scramble` + `realize` run in a Web Worker; the main thread shows "Scrambling…" (the only text besides the top bar) and receives the engine state as a transferable snapshot. After a win, the next board is generated in the background so Next is instant.
- Settings persist in `localStorage` under `rope-tangle/settings`: `{ ropes, showMoves }`. Nothing else is stored; a reload gives a new board. (All games on adrianschmidt.github.io share one origin's storage, so this stays tiny.)

## 11. Testing

- `diagram`: move semantics on hand-built cases (hook, twist, lifted stretch with and without under-crossings, self-crossing), the parity invariant over random move sequences, replay determinism, degeneracy handling.
- `recipes`: each recipe's `match` on positive and negative cases; `apply` produces the documented pair sequences.
- `scramble`: over many seeds and rope counts, every rope hooked, retry rate, determinism (same seed, same diagram).
- `engine`: scripted move batteries (as in the prototype's `T.run`) with the pass-through monitor: zero flags on normal boards, minimum centerline gap reported; settle time; a forced pass-through is detected (monitor sanity). Inflation from zero thickness on realized boards never produces a monitor flag.
- `realize`: hole fitting preserves cyclic order and adds no crossings; agreement rate over many seeds per rope count (the number that decides when the check can go); a disagreement produces a dump that reproduces the case.
- Benchmarks (not asserted): ms per substep for fresh 5/8/10-rope boards and for a dense tangle; generation time per rope count.
- Playwright: grab, drag, release into a hole, release away from a hole, grab while another end flies, play a board to the win overlay; throttled-CPU run to check the handle stays responsive.

## 12. Later

Designed for, not built: other hole layouts (the board is data; the engine's peg obstacle needs a disc variant for interior pegs; the scrambler's end placement and hole fitting need a non-rim variant); more recipes; curated boards from saved seeds and logs; par derived from the move log; WebGL rendering with shading for depth cues; sound.

## 13. Decisions and their reasons

- Thick ropes with height instead of a 2D crossing list: the first prototype's knots collapsed below one rope width and could not be drawn; heights also give the draw order for free.
- No par: it was becoming a constraint on the scrambler. The move log is kept so a par can be derived later.
- Abstract scrambling: recipes need exact combinatorics, which physics can only approximate; the physics is only asked to realize a known tangle.
- Diagram on a circle with midpoint placement and no spacing rules: spacing in the diagram means nothing, holes are assigned by order alone, and keeping the diagram deterministic makes every generated board reproducible from its seed.
- No replay fallback: a disagreement between diagram and physics is a bug to fix, not a case to paper over; the dump makes it reproducible.
- Snap to nearest hole on release: retracing the drag path did not restore the starting state and looked wrong.
- Ends finish flights on their own: waiting for the board to settle between moves was the main feel complaint.
