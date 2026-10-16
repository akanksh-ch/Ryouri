// Run against the dev/preview server: PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node apps/website/tests/motion.browser.mjs
import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const browser = await chromium.launch({ headless: true });
const recipes = [
  { id: "rice", title: "Rice", cuisine: "Indian", cookMinutes: 20, imageUrl: null },
  { id: "salad", title: "Salad", cuisine: "Italian", cookMinutes: 5, imageUrl: null },
  { id: "soup", title: "Soup", cuisine: "Indian", cookMinutes: 10, imageUrl: null },
];
try {
  for (const reducedMotion of ["no-preference", "reduce"]) {
    const colorScheme = process.env.COLOR_SCHEME || "light";
    const page = await browser.newPage({
      colorScheme,
      reducedMotion,
      viewport: { width: process.env.MOBILE ? 390 : 1280, height: 900 },
    });
    page.setDefaultTimeout(10000);
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.route("**/api/**", (route) =>
      route.fulfill({
        json: route.request().url().includes("/cuisines") ? ["Indian", "Italian"] : recipes,
      }),
    );
    await page.goto(process.env.BASE_URL || "http://127.0.0.1:5179");
    await page.getByRole("link", { name: /Rice$/ }).waitFor();
    assert.equal(
      await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme),
      colorScheme,
      "system theme survives collection motion integration",
    );
    await page.waitForFunction(() =>
      [...document.querySelectorAll('[data-slot="card"]')].every(
        (card) => getComputedStyle(card).opacity === "1",
      ),
    );
    const search = page.getByRole("searchbox");
    await search.fill("Rice");
    await page.getByRole("link", { name: /Salad$/ }).waitFor({ state: "detached" });
    assert.equal(await search.evaluate((el) => el === document.activeElement), true);
    // Observe at insertion, not after an automation round-trip that can outlast a brief animation.
    await page.evaluate(() => {
      window.entryOpacities = [];
      new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (node instanceof HTMLElement && node.matches('[data-slot="card"]')) {
              window.entryOpacities.push(Number(getComputedStyle(node).opacity));
            }
          }
        }
      }).observe(document.body, { childList: true, subtree: true });
    });
    await search.fill("");
    const card = page
      .locator('[data-slot="card"]')
      .filter({ has: page.getByRole("link", { name: /Salad$/ }) });
    await card.waitFor();
    const moving = await page.evaluate(() => window.entryOpacities.some((opacity) => opacity < 1));
    assert.equal(moving, reducedMotion !== "reduce", "result entry motion follows preference");
    await search.fill("missing");
    await page.getByRole("heading", { name: "No recipes match your filters" }).waitFor();
    await search.fill("s");
    await search.fill("ri");
    await search.fill("");
    assert.equal(
      await page.getByRole("article").count(),
      3,
      "rapid filtering never queues stale cards",
    );
    await page.waitForTimeout(300);
    assert.equal(await card.evaluate((el) => getComputedStyle(el).opacity), "1");
    assert.equal(
      await card.evaluate(
        (el) => el.getAnimations().filter((a) => a.playState === "running").length,
      ),
      0,
      "no perpetual animation",
    );
    const retainedCard = await card.elementHandle();
    await search.fill("s");
    assert.equal(
      await retainedCard.evaluate((el) => el.isConnected),
      true,
      "surviving cards keep their DOM identity during layout changes",
    );
    await search.fill("");
    const filters = page.getByRole("button", { name: "Filters", exact: true });
    await filters.click();
    const dialog = page.getByRole("dialog", { name: "Recipe filters" });
    await dialog.waitFor();
    if (reducedMotion === "reduce") {
      assert.equal(
        await dialog.evaluate((el) => getComputedStyle(el).animationName),
        "none",
        "popover CSS motion is disabled too",
      );
    }
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "detached" });
    assert.equal(
      await filters.evaluate((el) => el === document.activeElement),
      true,
      "popover restores focus",
    );
    // Preference changes must apply without a reload, including to Motion's inline animations.
    await page.emulateMedia({ reducedMotion: "reduce" });
    await search.fill("Rice");
    await search.fill("");
    await card.waitFor();
    assert.equal(await card.evaluate((el) => getComputedStyle(el).opacity), "1");
    assert.equal(
      await card.evaluate(
        (el) => el.getAnimations().filter((a) => a.playState === "running").length,
      ),
      0,
    );
    assert.deepEqual(errors, []);
    console.log(
      `PASS ${colorScheme}/${reducedMotion}: theme, entry, rapid filtering, visibility, focus, runtime preference change, no loops/errors`,
    );
    await page.close();
  }
} finally {
  await browser.close();
}
