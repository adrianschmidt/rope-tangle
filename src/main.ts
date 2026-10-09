import { startApp } from "./game/app";

startApp(document, window);

const deployId = import.meta.env.VITE_APP_VERSION;
if (deployId) {
  const label = document.createElement("div");
  label.id = "deploy-id";
  label.textContent = deployId;
  document.body.append(label);
}

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  const base = import.meta.env.BASE_URL;
  navigator.serviceWorker
    .register(`${base}sw.js`, { scope: base })
    .then(() => navigator.serviceWorker.ready)
    .then((reg) => reg.active?.postMessage({ cacheUrls: performance.getEntriesByType("resource").map((e) => e.name) }))
    .catch(() => undefined);
}
