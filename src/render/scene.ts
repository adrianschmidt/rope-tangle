import { PEG_R, W } from "../engine/constants";
import type { Engine } from "../engine/engine";
import type { Point } from "../util/point";
import { beginFrame, colorOf, drawHoles, drawRopes, OUTLINE, type View } from "./ropes";

export interface SceneState {
  pointer: Point | null;
  hoverHole: number | null;
  fades: ReadonlyMap<number, number>;
}

function tether(ctx: CanvasRenderingContext2D, from: Point, way: readonly Point[], color: string): void {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  for (const w of way) ctx.lineTo(w.x, w.y);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = W + 3;
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = W;
  ctx.stroke();
}

export function drawScene(ctx: CanvasRenderingContext2D, E: Engine, colors: readonly string[], view: View, dpr: number, state: SceneState): void {
  beginFrame(ctx, view, dpr);
  drawHoles(ctx, E, colors, state.hoverHole);
  for (const r of E.ropes) {
    const a = state.fades.get(r.id) ?? 0;
    if (!r.cleared || a <= 0) continue;
    ctx.globalAlpha = a;
    drawRopes(ctx, [r], colors);
    ctx.globalAlpha = 1;
  }
  const act = E.active();
  drawRopes(ctx, act, colors);
  for (const r of act) {
    const color = colorOf(colors, r.id);
    for (const end of [0, 1] as const) {
      let p: Point = E.endPoint(r.id, end);
      const fly = E.flying.find((f) => f.rope === r.id && f.end === end);
      const held = E.held !== null && E.held.rope === r.id && E.held.end === end;
      const way = fly ? fly.path : held && state.pointer ? [state.pointer] : null;
      const last = way ? way[way.length - 1] : undefined;
      if (way && last && Math.hypot(last.x - p.x, last.y - p.y) > 1) {
        tether(ctx, p, way, color);
        p = last;
      }
      const lifted = fly !== undefined || held;
      ctx.beginPath();
      ctx.arc(p.x, p.y, lifted ? PEG_R * 0.95 : W * 0.75, 0, Math.PI * 2);
      if (lifted) {
        ctx.shadowColor = "#0006";
        ctx.shadowBlur = 12;
        ctx.shadowOffsetY = 4;
      }
      ctx.fillStyle = color;
      ctx.fill();
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
    }
  }
}
