import type { Board } from "../board";
import { cyclicOrder, normAngle, TAU, type Diagram } from "../diagram";
import type { Point } from "../util/point";
import type { Rng } from "../util/rng";
import { RealizeFailed } from "./errors";
import { validLayout, type Layout, type LNode } from "./layout";

export const INNER = 0.6;
const EXT_STEP = 16;
const MIN_SAMPLES = 4;
const REFINES = 6;

const wrapPi = (a: number) => normAngle(a + Math.PI) - Math.PI;

export function holeAngle(board: Board, hole: number): number {
  const h = board.holes[hole];
  if (!h) throw new Error(`no hole ${hole}`);
  return Math.atan2(h.y - board.height / 2, h.x - board.width / 2);
}

export function rimDistance(board: Board, angle: number): number {
  const dx = Math.abs(Math.cos(angle)), dy = Math.abs(Math.sin(angle));
  const sx = dx > 1e-12 ? board.width / 2 / dx : Infinity;
  const sy = dy > 1e-12 ? board.height / 2 / dy : Infinity;
  return Math.min(sx, sy);
}

export function unwrapTargets(theta: readonly number[], target: readonly number[]): number[] {
  const phi: number[] = [theta[0]! + wrapPi(target[0]! - theta[0]!)];
  for (let i = 1; i < target.length; i++) phi.push(phi[i - 1]! + normAngle(target[i]! - phi[i - 1]!));
  const mean = phi.reduce((sum, v, i) => sum + v - theta[i]!, 0) / phi.length;
  const shift = TAU * Math.round(mean / TAU);
  return phi.map((v) => v - shift);
}

export function assignHoles(d: Diagram, board: Board, rng: Rng): number[] {
  const order = cyclicOrder(d);
  const m = board.holes.length, k = order.length;
  if (k > m) throw new RealizeFailed(`assignHoles: ${k} ends but ${m} holes`);
  const idx = [...Array(m).keys()];
  for (let i = m - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [idx[i], idx[j]] = [idx[j]!, idx[i]!];
  }
  const chosen = idx.slice(0, k).sort((a, b) => a - b);
  const theta = order.map((e) => e.angle);
  const angles = chosen.map((h) => holeAngle(board, h));
  let bestR = 0, bestCost = Infinity;
  for (let r = 0; r < k; r++) {
    const phi = unwrapTargets(theta, theta.map((_, i) => angles[(i + r) % k]!));
    const cost = phi.reduce((sum, v, i) => sum + (v - theta[i]!) ** 2, 0);
    if (cost < bestCost) {
      bestCost = cost;
      bestR = r;
    }
  }
  const holes = Array.from({ length: k }, () => -1);
  order.forEach((e, i) => {
    holes[e.rope * 2 + e.end] = chosen[(i + bestR) % k]!;
  });
  return holes;
}

export interface Embedding {
  center: Point;
  radius: number;
  ends: { theta: number; phi: number }[];
}

export function embedding(d: Diagram, board: Board, holes: readonly number[]): Embedding {
  const order = cyclicOrder(d);
  const theta = order.map((e) => e.angle);
  const phi = unwrapTargets(theta, order.map((e) => holeAngle(board, holes[e.rope * 2 + e.end]!)));
  const ends = Array.from({ length: d.ends.length }, () => ({ theta: 0, phi: 0 }));
  order.forEach((e, i) => {
    ends[e.rope * 2 + e.end] = { theta: theta[i]!, phi: phi[i]! };
  });
  return { center: { x: board.width / 2, y: board.height / 2 }, radius: (INNER * Math.min(board.width, board.height)) / 2, ends };
}

export function extensionPoint(board: Board, emb: Embedding, end: number, s: number): Point {
  const e = emb.ends[end];
  if (!e) throw new Error(`no end ${end}`);
  const a = e.theta + s * (e.phi - e.theta);
  const rho = emb.radius + s * (rimDistance(board, a) - emb.radius);
  return { x: emb.center.x + rho * Math.cos(a), y: emb.center.y + rho * Math.sin(a) };
}

function sampleCount(board: Board, emb: Embedding): number {
  let k = MIN_SAMPLES;
  for (const e of emb.ends) {
    const rim = rimDistance(board, e.phi);
    const len = (Math.abs(e.phi - e.theta) * (emb.radius + rim)) / 2 + (rim - emb.radius);
    k = Math.max(k, Math.ceil(len / EXT_STEP));
  }
  return k;
}

function sampleLayout(d: Diagram, board: Board, holes: readonly number[], emb: Embedding, samples: number): Layout {
  const nodes: LNode[] = [];
  const crossingNode = new Map<number, number>();
  const add = (p: Point, fixed: boolean): number => {
    nodes.push({ x: p.x, y: p.y, fixed });
    return nodes.length - 1;
  };
  const inDisc = (v: Point): Point => ({ x: emb.center.x + emb.radius * v.x, y: emb.center.y + emb.radius * v.y });
  const ropes = d.ropes.map((rope) => {
    const vs = rope.vertices, last = vs.length - 1;
    const ids: number[] = [], labels: (boolean | null)[] = [];
    const push = (n: number, label: boolean | null) => {
      ids.push(n);
      labels.push(label);
    };
    push(add(board.holes[holes[rope.id * 2]!]!, true), null);
    for (let j = samples - 1; j >= 1; j--) push(add(extensionPoint(board, emb, rope.id * 2, j / samples), false), null);
    vs.forEach((v, i) => {
      if (v.kind === "crossing" && i > 0 && i < last) {
        const id = v.crossingId!;
        let n = crossingNode.get(id);
        if (n === undefined) {
          n = add(inDisc(v), false);
          crossingNode.set(id, n);
        }
        push(n, v.overHere === true);
      } else {
        push(add(inDisc(v), false), null);
      }
    });
    for (let j = 1; j < samples; j++) push(add(extensionPoint(board, emb, rope.id * 2 + 1, j / samples), false), null);
    push(add(board.holes[holes[rope.id * 2 + 1]!]!, true), null);
    return { nodes: ids, labels };
  });
  return { nodes, ropes };
}

export function buildLayout(d: Diagram, board: Board, holes: readonly number[]): Layout {
  const emb = embedding(d, board, holes);
  let samples = sampleCount(board, emb);
  for (let attempt = 0; attempt < REFINES; attempt++) {
    const layout = sampleLayout(d, board, holes, emb, samples);
    if (validLayout(layout)) return layout;
    samples *= 2;
  }
  throw new RealizeFailed("fit: no valid layout after refining");
}
