# Rope Tangle — design spec

Date: 2026-10-08
Status: draft for review
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

Modern TypeScript + Vite + PWA + canvas 2D, tests with vitest, same as the other games. No framework.

Modules, each a directory under `src/`:

| Module | Responsibility | Depends on |
|---|---|---|
| `board` | Hole layout as data; rim parametrization | — |
| `diagram` | Abstract tangle: ropes as polylines with over/under crossings; the move operation; queries | — |
| `recipes` | Named tangle patterns: match against a diagram, emit moves | `diagram` |
| `scramble` | Builds a diagram from a seed, rope count and difficulty; fits ends to holes | `diagram`, `recipes`, `board` |
| `engine` | Physics: thick ropes with height, contacts, pegs, held/flying/landing ends; crossing readout | `board` |
| `realize` | Turns a diagram into an engine state (fast path) or replays its moves (fallback) and checks agreement | `diagram`, `engine` |
| `render` | Draws board, ropes, handles | `engine`, `board` |
| `game` | Input, phases, clearing, win, settings, generation in a worker | all |

Data flow for a new board: `scramble` (pure, fast) → `realize` (physics settle, in a Web Worker) → `game` receives the engine state → play.

## 5. Board (`board`)

```ts
interface Hole { x: number; y: number; rim: number; ox: number; oy: number }
interface Board { width: number; height: number; holes: Hole[]; rimLength: number }
```

- `rim` is the hole's position along the rim, measured clockwise from the top-left corner, in board units. `ox, oy` is the outward normal (diagonal at corners).
- The rim-only generator makes a `cols × rows` grid with 64-unit pitch and holes on the perimeter only. Size by rope count: 4→4×5, 5→4×6, 6→5×6, 7→5×7, 8→6×7, 9→6×8, 10→7×8 (holes ≥ 2 × ropes + 4 in every case).
- `rimPoint(board, t)` maps a rim parameter `t ∈ [0, rimLength)` to a point on the rectangle; `rimOf(board, hole)` is its inverse for holes.
- The layout is data so that later board types only add generators. Nothing else in the game may assume holes are on the rim except the scrambler's end placement (§7.4) and the engine's peg obstacle shape (§8.4).

## 6. Diagram (`diagram`)

The abstract tangle. No physics, no thickness. Everything the scrambler and recipes need is answered here.

### 6.1 Data

```ts
interface Vertex { x: number; y: number; kind: 'end' | 'fold' | 'crossing'; crossing?: Crossing }
interface RopeD { id: number; vertices: Vertex[] }          // vertices[0] is end 0, last is end 1
interface Crossing { id: number; a: number; b: number; over: number; posA: number; posB: number }
interface Diagram { ropes: RopeD[]; crossings: Map<number, Crossing>; ends: EndPos[] }
interface EndPos { rope: number; end: 0 | 1; t: number }     // rim parameter
```

- A rope is a polyline. Crossing vertices appear in both ropes' vertex lists (sharing one `Crossing` record). `posA`/`posB` are the crossing's index positions along each rope, kept consistent after every edit.
- `over` names the rope on top. A crossing may be a self-crossing (`a === b`); self-crossings are kept for correctness but never count as "crossing something" for the clearing rule.
- `fold` vertices are plain route points with no topological meaning (§7.4 uses them).
- Geometry is deliberately allowed to be ugly. Correctness depends only on: every vertex sequence is a valid polyline, segments intersect only at recorded crossings, and `over` labels are right. The physics straightens everything later.

### 6.2 The move

`moveEnd(diagram, rope, end, t)` moves one rope end to rim position `t`, as the game's physical move would:

1. Walk from the moved end back along the rope to the nearest crossing where this rope is **under**. Everything beyond it (toward the moved end) is the lifted stretch. If there is none, the whole rope is lifted.
2. Delete every crossing on the lifted stretch (from both ropes' vertex lists). Delete the lifted vertices.
3. Append one straight segment from the hold-down vertex (the under-crossing, or the other end) to `rimPoint(t)`, and set the end's rim position.
4. Intersect the new segment with every segment of every rope, including the retained part of this rope. Each intersection becomes a crossing with `over = rope`, inserted into both polylines at the right positions.
5. Degeneracies: if `t` is within `MIN_END_GAP` (one hole pitch) of another end, slide `t` to the nearest point that is not; if the new segment passes through an existing vertex or crosses another segment at its endpoint, nudge `t` by a small amount and retry (bounded retries, then throw `DiagramDegenerate`).

Why this is right: a lifted end passes over everything, and with all ends on the rim the result of a move depends only on where the end lands in the cyclic order of ends, not on the path or the current shape of the ropes. So any valid planar drawing gives a topologically correct result.

### 6.3 Queries

- `pairSequence(d, a, b, fromEnd)`: labels (`'over' | 'under'` from `a`'s point of view) of the crossings between `a` and `b`, ordered along `a` from the given end.
- `isHooked(d, a, b)`: the pair sequence contains both labels.
- `hookedRopes(d)`: ropes hooked with at least one other rope.
- `crossingCount(d, rope)`: crossings with other ropes (self-crossings excluded).
- `cyclicOrder(d)`: ends sorted by rim position.
- `liftedStretch(d, rope, end)`: the crossings a move of that end would remove (the step-1 walk). Recipes use it to reason about what a move will and won't undo.
- `reduce(d)` (optional, not needed for correctness): remove crossing pairs that are adjacent along both ropes with the same `over`. Keeps diagrams small on long scrambles.

### 6.4 Invariants (tested)

- After any sequence of moves, for every pair of ropes the parity of their crossing count equals whether their ends alternate around the rim.
- Replaying a move log on a fresh diagram reproduces the same diagram.
- `moveEnd` of an end back to the exact rim position it came from, when the lifted stretch had only over-crossings created by the previous move, restores the previous pair sequences (undo property).

## 7. Recipes and scrambling (`recipes`, `scramble`)

### 7.1 Recipe

```ts
interface Recipe {
  name: string;
  arity: number;                               // ropes involved
  weight: number;                              // deck weight
  match(d: Diagram, ropes: number[]): Binding | null;
  apply(d: Diagram, b: Binding, rng: Rng): void;   // calls moveEnd one or more times
}
```

- A `Binding` names the involved ropes and which of their ends are running ends (will be moved) and standing ends (will not). An end attached to the rim can play either role; a recipe never moves anything but a running end at the rim.
- `match` is purely combinatorial: cyclic order of the involved ends (up to rotation and mirroring) plus the pair sequences the recipe requires. It ignores uninvolved ropes.
- Move targets are rim **intervals** between named ends, never holes or absolute positions. `apply` picks a position inside the interval (midpoint by default, jittered by `rng`) and calls `moveEnd`.
- Side effects on uninvolved ropes (extra crossings, accidental hooks) are allowed and welcome. Recipes do not verify anything; the diagram is exact.

### 7.2 Initial deck

1. **Cross** (2 ropes, 1 move). Precondition: the ropes' ends do not alternate around the rim. Move A's running end so that they do. Result: A over B once. Sets up later hooks.
2. **Hook** (2 ropes, 1 move). Precondition: the crossing of A with B nearest A's running end is `under`, and A's lifted stretch contains no `under` crossing with B (guaranteed by the walk). Move A's running end so that the A/B ends stop alternating. Result: A passes under B then over it: A is hooked on B.
3. **Twist** (2 ropes, N moves, N ∈ {2, 3}). Hook A on B, then move B's running end across A's new segment (B is under A there, so it hooks back), alternating, N times. Result: the two ropes wind around each other.

Recipes are data plus two functions; adding one is a content change. Candidates for later: hook-through (a rope that already runs under a hook's loop is then moved over), chain (A on B on C), weave (over–under across several ropes).

### 7.3 Scrambler

```ts
scramble(seed: number, ropeCount: number, difficulty: Difficulty): { diagram: Diagram; log: Move[] }
```

1. Seeded RNG (mulberry32 as in the spike). Place `2 × ropeCount` ends around the rim at random positions with at least `MIN_END_GAP` between them; pair neighboring ends into ropes so the start has no crossings. Assign colors.
2. Loop:
   - Enumerate all (recipe, rope tuple) pairs whose `match` succeeds.
   - Pick one at random, weighted by recipe weight; apply it; append its moves to the log.
   - Stop when every rope is hooked (`hookedRopes(d)` is all ropes) **and** at least `difficulty.recipes` recipes have been applied. Give up after `difficulty.maxRecipes` and retry with the next seed (counted in telemetry during development; must be rare).
3. Fit ends to holes (§7.4).

`Difficulty` for the first release is derived from rope count only: `recipes = ropeCount`, `maxRecipes = 4 × ropeCount`. The deck and its weights are the knobs for later difficulty settings.

### 7.4 Fitting ends to holes

Ends have continuous rim positions; holes are discrete. Map ends to holes by a random monotone assignment that preserves cyclic order and spreads the ends over the available holes (each end gets its own hole; gaps are distributed at random with at least the gaps needed to use the whole rim).

Moving an end's rim position changes the geometry of its last segment, which could add or remove crossings on it. To keep the diagram exact, do not move the segment: insert a `fold` vertex at the end's old position pulled one rope width inward from the rim, and run a new last segment from that fold along the rim strip to the hole. No other rope has a segment inside the rim strip between two neighboring ends, so the new segment crosses nothing. The physics removes the fold when it settles.

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
- An end may also be **pinned at an arbitrary rim point** (virtual peg) for the fallback realization (§9.2). Pinned ends behave like holes, including the obstacle.

### 8.3 Pegs

A hole with an end attached is an obstacle for all other ropes: a capsule of radius `POST_R = 25` from the hole centre extending outward through the rim, so ropes always pass on the board side. Pushes are capped at 2 units per iteration (hard pushes caused pass-throughs in the prototype). A held rope ignores pegs while its particles are above `POST_H = 38`, and ignores its origin hole until lifted.

### 8.4 Readout

- `signature()`: crossings from the xy projection of the current state, with over/under by height, grouped per rope pair and ordered along each rope. Computed on demand (cheap) and used by clearing (§10.4), by `realize` (§9) and by tests.
- Dev-only **pass-through monitor**: compares successive signatures and flags any change that cannot come from a legal move (a label flip, a pair appearing with opposite labels, a crossing appearing or vanishing away from a free rope). It has known false positives when crossings stack on one spot; it is a test instrument, not game logic.

### 8.5 Performance budget

Measured on the Mac mini with the prototype: 0.03–0.14 ms per substep on fresh boards, 0.38 ms on a 54-crossing tangle. The game must keep: handle follows the finger instantly (§10.2), rope catches up within 1 s on an 8-rope board on a mid-range phone, settle after drop under 1 s. The frame loop gives physics a time budget (`14 ms − last render time`, clamped to 4–11 ms) and runs at least two substeps per frame.

## 9. Realization (`realize`)

Turns a scrambled diagram into a settled engine state.

### 9.1 Fast path: place and inflate

1. For each diagram rope, build the particle chain along its polyline (ends, folds, crossing vertices) at `H0` spacing.
2. Heights: at each crossing set the over strand to `+8` and the under strand to `−8` (half the final contact distance); interpolate linearly in arc length between crossings; ends at 0.
3. Create the engine with contact distance 0, then settle while growing the contact distance linearly to `D = 16` over 150 substeps, then settle to rest (net movement over an 8-substep window below 0.15 units, or 800 substeps). The heights already encode every crossing's order, and nothing starts penetrated, so contacts never have to guess which way to push.
4. Compare the engine's signature with the diagram (§9.3). On agreement, done.

### 9.2 Fallback: replay

Build the initial non-crossing state in the engine with ends pinned at the diagram's initial rim positions (virtual pegs), replay the move log as physical moves (pin the end at the move's rim position), then slide each end along the rim to its hole. This is what the prototype does today and is known to hold up.

The fallback exists so that the game works while the fast path is being proven. The long-term goal is a fast path that has been tested to agree so reliably that both the comparison and the fallback can be removed.

### 9.3 Agreement check

For each rope pair, take the physical and the diagram pair sequences, reduce each by deleting adjacent equal labels (the physics performs exactly those simplifications when ropes pull taut), and require them to be equal; also require identical cyclic order of ends and the same set of hooked pairs. Record the outcome; development builds log the disagreement rate.

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

Canvas 2D, device pixel ratio capped at 2. Ropes are flat ribbons (width 12, dark outline 1.5) drawn in painter's order by height: each rope is cut into pieces at its particles, pieces sorted by quantized height, consecutive pieces of one rope at the same height merged into one stroke. Pieces are extended by 0.75 units at their ends to hide seams. Pegs are discs; empty holes are pale discs. The held/flying handle is drawn on top with a shadow. Ten distinct rope colors.

### 10.6 Generation and settings

- `scramble` + `realize` run in a Web Worker; the main thread shows "Scrambling…" (the only text besides the top bar) and receives the engine state as a transferable snapshot. After a win, the next board is generated in the background so Next is instant.
- Settings persist in `localStorage` under `rope-tangle/settings`: `{ ropes, showMoves }`. Nothing else is stored; a reload gives a new board. (All games on adrianschmidt.github.io share one origin's storage, so this stays tiny.)

## 11. Testing

- `diagram`: move semantics on hand-built cases (hook, twist, lifted stretch with and without under-crossings, self-crossing), the parity invariant over random move sequences, replay determinism, degeneracy handling.
- `recipes`: each recipe's `match` on positive and negative cases; `apply` produces the documented pair sequences.
- `scramble`: over many seeds and rope counts, every rope hooked, hole fitting preserves cyclic order and adds no crossings, retry rate.
- `engine`: scripted move batteries (as in the prototype's `T.run`) with the pass-through monitor: zero flags on normal boards, minimum centerline gap reported; settle time; a forced pass-through is detected (monitor sanity).
- `realize`: agreement rate of the fast path over many seeds per rope count (target ≥ 99% before removing the fallback); fallback produces a board for every seed.
- Benchmarks (not asserted): ms per substep for fresh 5/8/10-rope boards and for a dense tangle; generation time per rope count.
- Playwright: grab, drag, release into a hole, release away from a hole, grab while another end flies, play a board to the win overlay; throttled-CPU run to check the handle stays responsive.

## 12. Later

Designed for, not built: other hole layouts (the board is data; the engine's peg obstacle needs a disc variant for interior pegs; the scrambler's end placement and hole fitting need a non-rim variant); more recipes; curated boards from saved seeds and logs; par derived from the move log; WebGL rendering with shading for depth cues; sound.

## 13. Decisions and their reasons

- Thick ropes with height instead of a 2D crossing list: the first prototype's knots collapsed below one rope width and could not be drawn; heights also give the draw order for free.
- No par: it was becoming a constraint on the scrambler. The move log is kept so a par can be derived later.
- Abstract scrambling: recipes need exact combinatorics, which physics can only approximate; the physics is only asked to realize a known tangle.
- Snap to nearest hole on release: retracing the drag path did not restore the starting state and looked wrong.
- Ends finish flights on their own: waiting for the board to settle between moves was the main feel complaint.
