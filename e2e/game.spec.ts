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

  test("keeps dragging accurate after a resize", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 420 });
    await drag(page, await at(page, 192, 256), await at(page, 128, 256));
    await idle(page);
    expect((await state(page)).ends[0]![1]).toBe(await holeAt(page, 128, 256));
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
    expect(stats.meanMs).toBeLessThan(50);
  });
});
