import type { Board } from "../board";
import { PEG_R, W } from "../engine/constants";
import type { Engine } from "../engine/engine";
import type { ERope } from "../engine/types";

export const ROPE_COLORS: readonly string[] = [
  "#2e9e3a", "#2f7fe0", "#e0453a", "#f0a020", "#8e44d0", "#18b3b3", "#e05fa8", "#8a5a33", "#b8a800", "#5c6b7a",
];

const OUTLINE = "#1d2230";
const BACKGROUND = "#eef1f8";
const EMPTY_HOLE = "#d6dbee";
const EXT = 0.75;

export interface View {
  s: number;
  ox: number;
  oy: number;
}

export function fitView(board: Board, width: number, height: number): View {
  const m = PEG_R + 10, bw = board.width + 2 * m, bh = board.height + 2 * m;
  const s = Math.min(width / bw, height / bh);
  return { s, ox: (width - bw * s) / 2 + m * s, oy: (height - bh * s) / 2 + m * s };
}

const colorOf = (colors: readonly string[], id: number): string => colors[id % colors.length] ?? OUTLINE;

function runPath(ctx: CanvasRenderingContext2D, r: ERope, k0: number, k1: number): void {
  const p = r.pts, n = p.length;
  ctx.beginPath();
  if (k0 === 0) ctx.moveTo(p[0]!.x, p[0]!.y);
  else {
    const a = p[k0 - 1]!, b = p[k0]!, l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    ctx.moveTo((a.x + b.x) / 2 - ((b.x - a.x) / l) * EXT, (a.y + b.y) / 2 - ((b.y - a.y) / l) * EXT);
  }
  for (let k = k0; k <= k1; k++) ctx.lineTo(p[k]!.x, p[k]!.y);
  if (k1 < n - 1) {
    const a = p[k1]!, b = p[k1 + 1]!, l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    ctx.lineTo((a.x + b.x) / 2 + ((b.x - a.x) / l) * EXT, (a.y + b.y) / 2 + ((b.y - a.y) / l) * EXT);
  }
}

function drawRopes(ctx: CanvasRenderingContext2D, list: readonly ERope[], colors: readonly string[]): void {
  const pieces: { r: ERope; k: number; z: number }[] = [];
  for (const r of list) r.pts.forEach((p, k) => pieces.push({ r, k, z: Math.round(p.z) }));
  pieces.sort((a, b) => a.z - b.z || a.r.id - b.r.id || a.k - b.k);
  ctx.lineCap = "butt";
  ctx.lineJoin = "round";
  let i = 0;
  while (i < pieces.length) {
    const first = pieces[i]!;
    let j = i;
    while (j + 1 < pieces.length && pieces[j + 1]!.r === first.r && pieces[j + 1]!.z === first.z && pieces[j + 1]!.k === pieces[j]!.k + 1) j++;
    runPath(ctx, first.r, first.k, pieces[j]!.k);
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = W + 3;
    ctx.stroke();
    ctx.strokeStyle = colorOf(colors, first.r.id);
    ctx.lineWidth = W;
    ctx.stroke();
    i = j + 1;
  }
}

export function drawBoard(ctx: CanvasRenderingContext2D, E: Engine, colors: readonly string[], view: View, dpr: number): void {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, ctx.canvas.width / dpr, ctx.canvas.height / dpr);
  ctx.setTransform(dpr * view.s, 0, 0, dpr * view.s, dpr * view.ox, dpr * view.oy);
  const owner = new Map<number, number>();
  for (const r of E.active()) for (const h of r.ends) if (h !== null) owner.set(h, r.id);
  E.board.holes.forEach((P, i) => {
    ctx.beginPath();
    ctx.arc(P.x, P.y, PEG_R, 0, Math.PI * 2);
    const o = owner.get(i);
    if (o === undefined) {
      ctx.fillStyle = EMPTY_HOLE;
      ctx.fill();
    } else {
      ctx.fillStyle = colorOf(colors, o);
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
    }
  });
  const act = E.active();
  drawRopes(ctx, act, colors);
  for (const r of act) {
    for (const p of [r.pts[0]!, r.pts[r.pts.length - 1]!]) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, W * 0.75, 0, Math.PI * 2);
      ctx.fillStyle = colorOf(colors, r.id);
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
    }
  }
}
