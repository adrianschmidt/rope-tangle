import type { Engine } from "../engine/engine";
import { fromSnapshot } from "../engine/snapshot";
import type { GenerateRequest, GenerateResponse } from "../generate/protocol";

export interface LoadedBoard {
  engine: Engine;
  seed: number;
  ropes: number;
  dumps: string[];
}

export function randomSeed(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return (a[0]! % 2_000_000_000) + 1;
}

export class BoardSource {
  private worker: Worker | null = null;
  private readonly waiting = new Map<number, (r: GenerateResponse) => void>();
  private nextId = 1;
  private prefetched: { ropes: number; promise: Promise<LoadedBoard> } | null = null;

  private spawn(): Worker {
    const w = new Worker(new URL("../generate/worker.ts", import.meta.url), { type: "module" });
    w.addEventListener("message", (e: MessageEvent<GenerateResponse>) => {
      const done = this.waiting.get(e.data.id);
      if (!done) return;
      this.waiting.delete(e.data.id);
      done(e.data);
    });
    w.addEventListener("error", () => {
      w.terminate();
      if (this.worker === w) this.worker = null;
      this.prefetched = null;
      const pending = [...this.waiting];
      this.waiting.clear();
      for (const [id, done] of pending) done({ id, ok: false, error: "The board generator stopped" });
    });
    return w;
  }

  next(ropes: number): Promise<LoadedBoard> {
    const p = this.prefetched && this.prefetched.ropes === ropes ? this.prefetched.promise : this.request(ropes);
    this.prefetched = null;
    return p;
  }

  prefetch(ropes: number): void {
    if (this.prefetched && this.prefetched.ropes === ropes) return;
    const promise = this.request(ropes);
    promise.catch(() => undefined);
    this.prefetched = { ropes, promise };
  }

  private request(ropes: number): Promise<LoadedBoard> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.waiting.set(id, (r) => {
        if (r.ok) resolve({ engine: fromSnapshot(r.snapshot), seed: r.seed, ropes, dumps: r.dumps });
        else reject(new Error(r.error));
      });
      const req: GenerateRequest = { id, seed: randomSeed(), ropes };
      this.worker ??= this.spawn();
      this.worker.postMessage(req, { transfer: [] });
    });
  }
}
