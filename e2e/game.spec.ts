import { expect, test, type Page } from "@playwright/test";

interface P {
  x: number;
  y: number;
}

const state = (page: Page) => page.evaluate(() => window.ropeTangleTest!.state());
const at = (page: Page, x: number, y: number) => page.evaluate(([bx, by]) => window.ropeTangleTest!.boardToClient(bx!, by!), [x, y]);
const holeAt = (page: Page, x: number, y: number) => page.evaluate(([bx, by]) => window.ropeTangleTest!.holeAt(bx!, by!), [x, y]);

async function drag(page: Page, from: P, to: P): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

async function loaded(page: Page): Promise<void> {
  await expect.poll(async () => (await state(page)).loading, { timeout: 60_000 }).toBe(false);
}

async function idle(page: Page): Promise<void> {
  await expect.poll(async () => (await state(page)).phase, { timeout: 30_000 }).toBe("idle");
}

test.describe("easy board", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("?test=1&board=easy");
    await loaded(page);
  });

  test("drags an end into another hole and counts the move", async ({ page }) => {
    await drag(page, await at(page, 192, 256), await at(page, 128, 256));
    await idle(page);
    const s = await state(page);
    expect(s.moves).toBe(1);
    expect(s.ends[0]![1]).toBe(await holeAt(page, 128, 256));
  });

  test("drops an end released between holes into the nearest free hole", async ({ page }) => {
    await drag(page, await at(page, 192, 256), await at(page, 150, 250));
    await idle(page);
    expect((await state(page)).ends[0]![1]).toBe(await holeAt(page, 128, 256));
  });

  test("releases an end let go over the top bar", async ({ page }) => {
    const from = await at(page, 192, 256);
    await drag(page, from, { x: from.x, y: 10 });
    await idle(page);
    const s = await state(page);
    expect(s.held).toBeNull();
    expect(s.ends[0]![1]).not.toBeNull();
  });

  test("grabs another rope while the first end is still flying", async ({ page }) => {
    const from = await at(page, 192, 256), to = await at(page, 128, 256);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y);
    await page.mouse.up();
    const other = await at(page, 192, 0);
    await page.mouse.move(other.x, other.y);
    await page.mouse.down();
    expect((await state(page)).held).toBe(1);
    await page.mouse.up();
    await idle(page);
  });

  test("solves the board and shows the win overlay", async ({ page }) => {
    await drag(page, await at(page, 192, 256), await at(page, 64, 0));
    await expect(page.locator("#overlay")).toContainText("Solved · 1 move", { timeout: 30_000 });
  });

  test("stops drawing while nothing moves and resumes on a drag", async ({ page }) => {
    await idle(page);
    await page.waitForTimeout(300);
    const before = await page.evaluate(() => window.ropeTangleTest!.frameStats().draws);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.ropeTangleTest!.frameStats().draws)).toBe(before);
    await drag(page, await at(page, 192, 256), await at(page, 128, 256));
    expect(await page.evaluate(() => window.ropeTangleTest!.frameStats().draws)).toBeGreaterThan(before);
  });

  test("shows the deploy ID in the bottom-right corner without blocking drags", async ({ page }) => {
    const label = page.locator("#deploy-id");
    await expect(label).toHaveText("e2e-build");
    const box = (await label.boundingBox())!, view = page.viewportSize()!;
    expect(box.x + box.width).toBeGreaterThan(view.width - 20);
    expect(box.y + box.height).toBeGreaterThan(view.height - 20);
    expect(await label.evaluate((el) => getComputedStyle(el).pointerEvents)).toBe("none");
  });

  test("keeps dragging accurate after a resize", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 420 });
    await expect.poll(() => page.evaluate(() => document.querySelector("canvas")!.style.width)).toBe("800px");
    await drag(page, await at(page, 192, 256), await at(page, 128, 256));
    await idle(page);
    expect((await state(page)).ends[0]![1]).toBe(await holeAt(page, 128, 256));
  });
});

test.describe("touch", () => {
  test.use({ hasTouch: true });

  test("ignores a second finger while dragging", async ({ page }) => {
    await page.goto("?test=1&board=easy");
    await loaded(page);
    const cdp = await page.context().newCDPSession(page);
    const a = await at(page, 192, 256), mid = await at(page, 100, 120), b = await at(page, 40, 10), c = await at(page, 64, 0);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: a.x, y: a.y, id: 1 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: mid.x, y: mid.y, id: 1 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: mid.x, y: mid.y, id: 1 }, { x: b.x, y: b.y, id: 2 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: mid.x, y: mid.y, id: 1 }, { x: c.x, y: c.y, id: 2 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await idle(page);
    const s = await state(page);
    expect(s.won).toBe(false);
    expect(s.ends[0]![1]).toBe(await holeAt(page, 192, 128));
  });
});

test.describe("failures", () => {
  test("offers another try when the board generator cannot start", async ({ page }) => {
    await page.route("**/assets/worker-*.js", (route) => route.abort());
    await page.goto("?test=1");
    await expect(page.locator("#overlay button")).toHaveText("Try again", { timeout: 15_000 });
  });
});

test.describe("offline", () => {
  test("plays offline after one visit", async ({ page, context }) => {
    await page.goto("?test=1");
    await loaded(page);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await expect
      .poll(
        () =>
          page.evaluate(async () => {
            const urls: string[] = [];
            for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) urls.push(r.url);
            return urls.some((u) => u.includes("/assets/worker-")) && urls.some((u) => u.includes("/assets/main-"));
          }),
        { timeout: 15_000 },
      )
      .toBe(true);
    await context.setOffline(true);
    await page.reload();
    await loaded(page);
    expect((await state(page)).active).toBeGreaterThan(0);
  });
});

test.describe("generated boards", () => {
  test("shows the board for the last rope count chosen", async ({ page }) => {
    await page.goto("?test=1&ropes=5");
    await loaded(page);
    await page.selectOption("#ropes", "4");
    await page.selectOption("#ropes", "7");
    await loaded(page);
    await expect.poll(async () => (await state(page)).active, { timeout: 60_000 }).toBe(7);
  });

  test("keeps frames flowing under a slowed-down CPU", async ({ page }) => {
    await page.goto("?test=1&ropes=8");
    await loaded(page);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const hole = (await state(page)).ends[0]![0]!;
    const from = await page.evaluate((i) => window.ropeTangleTest!.holeToClient(i), hole);
    await page.evaluate(() => window.ropeTangleTest!.resetFrameStats());
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 120, from.y + 200, { steps: 40 });
    await page.mouse.up();
    const stats = await page.evaluate(() => window.ropeTangleTest!.frameStats());
    expect(stats.frames).toBeGreaterThan(10);
    expect(stats.meanTickMs).toBeLessThan(30);
  });
});

async function touch(page: Page, p: P, end: "touchEnd" | "touchCancel"): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: p.x, y: p.y, id: 1 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: end, touchPoints: [] });
}

test.describe("back guard with a mouse", () => {
  test("ignores back requests after mouse clicks", async ({ page }) => {
    await page.goto("?test=1&board=easy");
    await loaded(page);
    const p = await at(page, 96, 128);
    await page.mouse.click(p.x, p.y);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    expect(await page.locator("#toast").isHidden()).toBe(true);
  });
});

test.describe("back guard", () => {
  test.use({ hasTouch: true });

  test("catches one back request per completed touch on the board", async ({ page }) => {
    await page.clock.install();
    await page.goto("?test=1&board=easy");
    await loaded(page);
    const p = await at(page, 96, 128), toast = page.locator("#toast");
    await touch(page, p, "touchEnd");
    await page.keyboard.press("Escape");
    await expect(toast).toHaveText("Go back again to leave");
    await page.clock.fastForward(2500);
    await expect(toast).toBeHidden();
    await touch(page, p, "touchCancel");
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    expect(await toast.isHidden()).toBe(true);
    await touch(page, p, "touchEnd");
    await page.keyboard.press("Escape");
    await expect(toast).toBeVisible();
  });

  test("falls back to a history entry where close watchers are missing", async ({ page }) => {
    await page.addInitScript(() => Reflect.deleteProperty(window, "CloseWatcher"));
    await page.goto("?test=1&board=easy");
    await loaded(page);
    const game = page.url(), p = await at(page, 96, 128);
    await touch(page, p, "touchEnd");
    await page.goBack();
    await expect(page.locator("#toast")).toHaveText("Go back again to leave");
    expect(page.url()).toBe(game);
    await touch(page, p, "touchCancel");
    await page.goBack();
    expect(page.url()).toBe("about:blank");
  });

  test("keeps the history guard in step with Forward", async ({ page }) => {
    await page.addInitScript(() => Reflect.deleteProperty(window, "CloseWatcher"));
    await page.goto("?test=1&board=easy");
    await loaded(page);
    const p = await at(page, 96, 128), toast = page.locator("#toast");
    await touch(page, p, "touchEnd");
    await page.goBack();
    await expect(toast).toBeVisible();
    await page.goForward();
    await touch(page, p, "touchEnd");
    await page.evaluate(() => document.getElementById("toast")!.hidden = true);
    await page.goBack();
    await expect(toast).toBeVisible();
    await page.goBack();
    expect(page.url()).toBe("about:blank");
  });

  test("keeps the history guard armed across a reload", async ({ page }) => {
    await page.addInitScript(() => Reflect.deleteProperty(window, "CloseWatcher"));
    await page.goto("?test=1&board=easy");
    await loaded(page);
    await touch(page, await at(page, 96, 128), "touchEnd");
    await page.reload();
    await loaded(page);
    await touch(page, await at(page, 96, 128), "touchEnd");
    await page.goBack();
    await expect(page.locator("#toast")).toHaveText("Go back again to leave");
    await page.goBack();
    expect(page.url()).toBe("about:blank");
  });
});
