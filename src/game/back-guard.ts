declare global {
  interface Window {
    CloseWatcher?: new () => EventTarget;
  }
}

function isGuard(state: unknown): boolean {
  return typeof state === "object" && state !== null && "backGuard" in state;
}

export function guardBack(win: Window, armOn: HTMLElement, onBack: () => void): void {
  const Watcher = win.CloseWatcher;
  let armed = !Watcher && isGuard(win.history.state);
  const caught = () => {
    armed = false;
    onBack();
  };
  if (!Watcher) win.addEventListener("popstate", (ev) => {
    const was = armed;
    armed = isGuard(ev.state);
    if (was && !armed) onBack();
  });
  armOn.addEventListener("pointerup", (ev) => {
    if (armed || ev.pointerType === "mouse") return;
    armed = true;
    if (Watcher) {
      const w = new Watcher();
      w.addEventListener("close", caught);
    } else {
      win.history.pushState({ backGuard: true }, "");
    }
  });
}
