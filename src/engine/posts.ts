import type { Hole } from "../board";
import { DMAX, POST_H, POST_R, POST_REACH } from "./constants";
import type { Engine } from "./engine";
import type { ERope, Particle } from "./types";

export interface PostHit {
  q: Particle;
  hole: Hole;
  free: boolean;
}

const reach = (t: number) => (t < 0 ? 0 : t > POST_REACH ? POST_REACH : t);

export function postCandidates(E: Engine, act: readonly ERope[]): PostHit[] {
  const { holes, width: bw, height: bh } = E.board;
  const R = POST_R + DMAX + 2;
  const posts = [...E.occupied()];
  const fromOf = new Map<number, number>();
  if (E.held && !E.held.lifted) fromOf.set(E.held.rope, E.held.from);
  for (const f of E.flying) if (!f.lifted) fromOf.set(f.rope, f.from);
  for (const h of fromOf.values()) if (!posts.includes(h)) posts.push(h);
  const out: PostHit[] = [];
  for (const r of act) {
    const p = r.pts, n = p.length, free = E.freeIds.has(r.id), skip = fromOf.get(r.id);
    for (let i = 1; i < n - 1; i++) {
      const q = p[i]!;
      if (q.x > R && q.x < bw - R && q.y > R && q.y < bh - R) continue;
      for (const hi of posts) {
        if (hi === r.ends[0] || hi === r.ends[1] || hi === skip) continue;
        const P = holes[hi]!;
        const t = reach((q.x - P.x) * P.ox + (q.y - P.y) * P.oy);
        const rx = q.x - P.x - P.ox * t, ry = q.y - P.y - P.oy * t;
        if (rx * rx + ry * ry < R * R) out.push({ q, hole: P, free });
      }
    }
  }
  return out;
}

export function applyPosts(list: readonly PostHit[]): void {
  for (const { q, hole: P, free } of list) {
    if (free && q.z >= POST_H) continue;
    const t = reach((q.x - P.x) * P.ox + (q.y - P.y) * P.oy);
    const rx = q.x - P.x - P.ox * t, ry = q.y - P.y - P.oy * t, d = Math.hypot(rx, ry);
    if (d >= POST_R) continue;
    const pen = POST_R - d, push = pen < 2 ? pen : 2;
    let dx = rx - P.ox * pen * 0.5, dy = ry - P.oy * pen * 0.5;
    const l = Math.hypot(dx, dy);
    if (l < 1e-9) {
      dx = -P.ox;
      dy = -P.oy;
    } else {
      dx /= l;
      dy /= l;
    }
    q.x += dx * push;
    q.y += dy * push;
  }
}
