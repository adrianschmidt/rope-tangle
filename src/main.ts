import { drawDiagram } from "./devpage/draw";
import { scrambleWithRetry } from "./scramble/scramble";

const q = new URLSearchParams(location.search);
const seed = Number(q.get("seed") ?? 1);
const ropes = Math.min(10, Math.max(2, Number(q.get("ropes") ?? 5) || 5));
const { diagram, log, seed: used } = scrambleWithRetry(seed, ropes);

const canvas = document.getElementById("cv");
const info = document.getElementById("info");
if (!(canvas instanceof HTMLCanvasElement) || !info) throw new Error("dev page markup missing");
const ctx = canvas.getContext("2d");
if (!ctx) throw new Error("no 2d context");
const size = Math.min(innerWidth, innerHeight - 80);
canvas.width = size;
canvas.height = size;
drawDiagram(ctx, diagram, size);

info.innerHTML =
  `seed ${used} · ${ropes} ropes · ${log.length} recipes · ${diagram.crossings.size} crossings ` +
  `<a href="?seed=${used - 1}&ropes=${ropes}">prev</a> <a href="?seed=${used + 1}&ropes=${ropes}">next</a><br>` +
  log.map((e) => `${e.recipe}(${e.a}→${e.b})`).join(" ");
