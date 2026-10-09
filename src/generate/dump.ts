import type { Crossing, Diagram, EndPos, RopeD } from "../diagram";
import { ENGINE_CONSTANTS } from "../engine/constants";
import type { PhysCrossing, Signature } from "../engine/types";
import type { Agreement } from "../realize/compare";
import { deck } from "../recipes/deck";
import type { Difficulty, ScrambleLogEntry } from "../scramble/scramble";

export interface DiagramJson {
  ropes: RopeD[];
  crossings: Crossing[];
  ends: EndPos[];
  nextCrossingId: number;
}

export function diagramToJson(d: Diagram): DiagramJson {
  return { ropes: d.ropes, crossings: [...d.crossings.values()], ends: d.ends, nextCrossingId: d.nextCrossingId };
}

export function diagramFromJson(j: DiagramJson): Diagram {
  return { ropes: j.ropes, crossings: new Map(j.crossings.map((c) => [c.id, c])), ends: j.ends, nextCrossingId: j.nextCrossingId };
}

export function flatSignature(sig: Signature): PhysCrossing[] {
  return [...sig.values()].flat();
}

export interface DumpInput {
  seed: number;
  ropes: number;
  difficulty: Difficulty;
  log: ScrambleLogEntry[];
  diagram: DiagramJson;
  holes: number[];
  stage: "fit" | "physics";
  error: string | null;
  signature: PhysCrossing[];
  comparison: Agreement | null;
  passThroughs: number;
}

export interface DebugDump extends DumpInput {
  kind: "rope-tangle-debug";
  app: string;
  deck: string[];
  constants: Record<string, number>;
}

export function makeDump(input: DumpInput): string {
  const dump: DebugDump = {
    kind: "rope-tangle-debug",
    app: APP_VERSION,
    deck: deck.map((r) => `${r.name}:${r.weight}`),
    constants: { ...ENGINE_CONSTANTS },
    ...input,
  };
  return JSON.stringify(dump);
}

function isDump(v: unknown): v is DebugDump {
  return typeof v === "object" && v !== null && "kind" in v && v.kind === "rope-tangle-debug";
}

export function parseDump(text: string): DebugDump {
  const v: unknown = JSON.parse(text);
  if (!isDump(v)) throw new Error("not a rope-tangle debug dump");
  return v;
}
