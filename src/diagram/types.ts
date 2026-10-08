export interface Vertex {
  x: number;
  y: number;
  kind: "end" | "fold" | "crossing";
  crossingId?: number;
  overHere?: boolean;
}

export interface Crossing {
  id: number;
  a: number;
  b: number;
  over: number;
}

export interface RopeD {
  id: number;
  vertices: Vertex[];
}

export interface EndRef {
  rope: number;
  end: 0 | 1;
}

export interface EndPos extends EndRef {
  angle: number;
}

export interface Gap {
  after: EndRef;
  before: EndRef;
}

export interface Diagram {
  ropes: RopeD[];
  crossings: Map<number, Crossing>;
  ends: EndPos[];
  nextCrossingId: number;
}

export class DiagramDegenerate extends Error {}
