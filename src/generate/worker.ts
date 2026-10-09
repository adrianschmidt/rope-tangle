import { snapshotTransfer } from "../engine/snapshot";
import { handleRequest, isGenerateRequest } from "./protocol";

addEventListener("message", (e: MessageEvent<unknown>) => {
  if (!isGenerateRequest(e.data)) return;
  const res = handleRequest(e.data);
  postMessage(res, { transfer: res.ok ? snapshotTransfer(res.snapshot) : [] });
});
