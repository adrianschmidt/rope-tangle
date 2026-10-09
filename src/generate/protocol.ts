import { toSnapshot, type EngineSnapshot } from "../engine/snapshot";
import { generateBoard } from "./generate";

export interface GenerateRequest {
  id: number;
  seed: number;
  ropes: number;
}

export type GenerateResponse =
  | { id: number; ok: true; seed: number; snapshot: EngineSnapshot; dumps: string[] }
  | { id: number; ok: false; error: string };

export function isGenerateRequest(v: unknown): v is GenerateRequest {
  return (
    typeof v === "object" && v !== null && "id" in v && "seed" in v && "ropes" in v &&
    typeof v.id === "number" && typeof v.seed === "number" && typeof v.ropes === "number"
  );
}

export function handleRequest(req: GenerateRequest): GenerateResponse {
  try {
    const g = generateBoard(req.seed, req.ropes);
    return { id: req.id, ok: true, seed: g.seed, snapshot: toSnapshot(g.engine), dumps: g.dumps };
  } catch (e) {
    return { id: req.id, ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
