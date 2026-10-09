import { drawDiagram } from "./devpage/draw";
import { generateBoard } from "./generate/generate";
import { drawBoard, fitView, ROPE_COLORS } from "./render/ropes";

const q = new URLSearchParams(location.search);
const seed = Math.max(1, Number(q.get("seed") ?? 1) || 1);
const ropes = Math.min(10, Math.max(4, Number(q.get("ropes") ?? 5) || 5));

const t0 = performance.now();
const g = generateBoard(seed, ropes, { monitor: true });
const ms = performance.now() - t0;

const canvasById = (id: string): HTMLCanvasElement => {
  const el = document.getElementById(id);
  if (!(el instanceof HTMLCanvasElement)) throw new Error(`dev page: missing #${id}`);
  return el;
};
const context = (c: HTMLCanvasElement): CanvasRenderingContext2D => {
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("dev page: no 2d context");
  return ctx;
};

const size = Math.max(200, Math.min(innerWidth / 2 - 16, innerHeight - 120));
const dpr = Math.min(devicePixelRatio || 1, 2);

const dc = canvasById("diagram");
dc.width = size;
dc.height = size;
drawDiagram(context(dc), g.scrambled.diagram, size);

const bc = canvasById("board");
bc.width = size * dpr;
bc.height = size * dpr;
bc.style.width = `${size}px`;
bc.style.height = `${size}px`;
drawBoard(context(bc), g.engine, ROPE_COLORS, fitView(g.engine.board, size, size), dpr);

let physical = 0;
for (const arr of g.engine.signature().values()) physical += arr.length;
const info = document.getElementById("info");
if (info) {
  info.innerHTML =
    `seed ${g.seed} · ${ropes} ropes · ${g.scrambled.log.length} recipes · diagram ${g.scrambled.diagram.crossings.size} crossings · ` +
    `physics ${physical} · tries ${g.tries} · ${ms.toFixed(0)} ms · inflation flags ${g.realized.inflationFlags} ` +
    `<a href="?seed=${g.seed - 1}&ropes=${ropes}">prev</a> <a href="?seed=${g.seed + 1}&ropes=${ropes}">next</a>`;
}
const dump = document.getElementById("dump");
if (dump instanceof HTMLTextAreaElement && g.dumps.length > 0) {
  dump.style.display = "block";
  dump.value = g.dumps.join("\n\n");
}
