import type { Board } from "../board";
import { D, H0 } from "../engine/constants";
import { Engine } from "../engine/engine";
import type { Monitor } from "../engine/monitor";
import { settle } from "../engine/settle";
import type { P3 } from "../engine/types";
import type { Layout } from "./layout";

export const RAMP = 150;

export interface PlaceOptions {
  monitor: Monitor | null;
}

export function chainPoints(L: Layout, rope: number): P3[] {
  const r = L.ropes[rope];
  if (!r) throw new Error(`chainPoints: no rope ${rope}`);
  const pts: P3[] = [], keys: { i: number; z: number }[] = [];
  const last = r.nodes.length - 1;
  for (let k = 0; k <= last; k++) {
    const P = L.nodes[r.nodes[k]!]!;
    if (k > 0) {
      const Q = L.nodes[r.nodes[k - 1]!]!;
      const n = Math.ceil(Math.hypot(P.x - Q.x, P.y - Q.y) / H0);
      for (let j = 1; j < n; j++) pts.push({ x: Q.x + ((P.x - Q.x) * j) / n, y: Q.y + ((P.y - Q.y) * j) / n, z: 0 });
    }
    const label = r.labels[k] ?? null;
    if (k === 0 || k === last) keys.push({ i: pts.length, z: 0 });
    else if (label !== null) keys.push({ i: pts.length, z: label ? D / 2 : -D / 2 });
    pts.push({ x: P.x, y: P.y, z: 0 });
  }
  const s = [0];
  for (let i = 1; i < pts.length; i++) s.push(s[i - 1]! + Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y));
  for (let q = 0; q + 1 < keys.length; q++) {
    const A = keys[q]!, B = keys[q + 1]!, span = s[B.i]! - s[A.i]!;
    for (let i = A.i; i <= B.i; i++) pts[i]!.z = span > 0 ? A.z + ((B.z - A.z) * (s[i]! - s[A.i]!)) / span : A.z;
  }
  return pts;
}

export function placeAndInflate(L: Layout, board: Board, holes: number[], opts: PlaceOptions): Engine {
  const E = new Engine(board);
  E.contactD = 0;
  E.resampleOn = false;
  E.tensionOn = false;
  L.ropes.forEach((_, i) => E.addRope(chainPoints(L, i), [holes[i * 2]!, holes[i * 2 + 1]!]));
  E.attachMonitor(opts.monitor);
  for (let i = 1; i <= RAMP; i++) {
    E.contactD = (D * i) / RAMP;
    E.substep(null);
  }
  E.tensionOn = true;
  E.resampleOn = true;
  E.minDist = Infinity;
  settle(E, 800, 0.15);
  E.attachMonitor(null);
  return E;
}
