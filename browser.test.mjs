import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseURL = process.env.GAME_URL || "http://127.0.0.1:8000";

async function prepare(page) {
  await page.addInitScript(() => {
    let callback;
    let time = 1000;
    window.requestAnimationFrame = (next) => {
      callback = next;
      return 1;
    };
    window.advanceGame = (frames = 1) => {
      for (let i = 0; i < frames; i++) {
        time += 1000 / 60;
        callback?.(time);
      }
    };
  });
  await page.goto(baseURL);
  await page.waitForFunction(() => document.getElementById("pause").disabled);
  await page.evaluate(() => window.advanceGame());
}

async function advance(page, frames = 9) {
  await page.evaluate((count) => window.advanceGame(count), frames);
}

async function redPixels(page) {
  return page.evaluate(() => {
    const data = document
      .getElementById("game")
      .getContext("2d")
      .getImageData(0, 0, 768, 768).data;
    let count = 0;
    for (let i = 0; i < data.length; i += 4)
      if (
        data[i] > 110 &&
        data[i] < 220 &&
        data[i + 1] < 85 &&
        data[i + 2] < 90
      )
        count++;
    return count;
  });
}

test("browser gameplay and responsive interface", async (t) => {
  const browser = await chromium.launch({
    ...(process.platform === "darwin" ? { channel: "chrome" } : {}),
    headless: true,
  });
  try {
    await t.test(
      "desktop start, movement, pause, collisions, blood, game over and restart",
      async () => {
        const page = await browser.newPage({
          viewport: { width: 1440, height: 1150 },
        });
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await prepare(page);
        assert.equal(await page.title(), "Monkey Crossing — A jungle commute");
        await page.screenshot({
          path: "/tmp/monkey-crossing-desktop.png",
          fullPage: true,
        });
        await page.click("#start");
        await page.keyboard.press("ArrowUp");
        assert.equal(await page.textContent("#score"), "0010");
        await advance(page);
        await page.keyboard.press("p");
        const time = await page.textContent("#time");
        await advance(page, 120);
        assert.equal(await page.textContent("#time"), time);
        assert.equal(
          await page.textContent("#game-status"),
          "TAKING A BREATHER",
        );
        await page.click("#start");
        await page.keyboard.press("ArrowDown");
        await advance(page);
        const before = await redPixels(page);
        let collided = false;
        for (let i = 0; i < 24; i++) {
          await page.keyboard.press("ArrowUp");
          if ((await page.textContent("#lives")).includes("○")) {
            collided = true;
            break;
          }
          await advance(page);
        }
        assert.ok(collided, "crossing traffic should produce a collision");
        await advance(page, 3);
        assert.ok(
          (await redPixels(page)) > before + 50,
          "car impact renders red blood particles",
        );
        await page.screenshot({
          path: "/tmp/monkey-crossing-impact.png",
          fullPage: true,
        });
        await page.click("#blood");
        assert.equal(
          await page.getAttribute("#blood", "aria-pressed"),
          "false",
        );
        await advance(page, 1);
        assert.ok(
          (await redPixels(page)) < before + 50,
          "turning blood off clears red particles",
        );
        await page.click("#sound");
        assert.equal(await page.getAttribute("#sound", "aria-pressed"), "true");
        for (let i = 0; i < 80; i++) {
          if (await page.isVisible("#overlay")) break;
          await advance(page, 10);
          await page.keyboard.press("ArrowUp");
        }
        await advance(page, 70);
        assert.equal(
          await page.textContent("#overlay-label"),
          "END OF THE ROAD",
        );
        assert.equal(
          await page.getAttribute("#lives", "aria-label"),
          "0 lives",
        );
        const best = await page.textContent("#best");
        await page.click("#start");
        assert.equal(await page.textContent("#score"), "0000");
        assert.equal(
          await page.getAttribute("#lives", "aria-label"),
          "3 lives",
        );
        await page.reload();
        assert.equal(await page.textContent("#best"), best);
        assert.equal(
          await page.getAttribute("#blood", "aria-pressed"),
          "false",
        );
        await page.click("#share");
        assert.match(await page.textContent("#toast"), /local preview/);
        assert.deepEqual(errors, []);
        await page.close();
      },
    );

    await t.test(
      "mobile layout, touch buttons, swipe and narrow screens",
      async () => {
        const context = await browser.newContext({
          viewport: { width: 390, height: 844 },
          isMobile: true,
          hasTouch: true,
          deviceScaleFactor: 2,
        });
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await prepare(page);
        await page.screenshot({
          path: "/tmp/monkey-crossing-mobile.png",
          fullPage: true,
        });
        const bounds = await page.locator(".arcade").boundingBox();
        const controls = await page.locator(".touch-controls").boundingBox();
        const sidebar = await page.locator(".sidebar").boundingBox();
        assert.ok(controls.y >= bounds.y + bounds.height);
        assert.ok(controls.y + controls.height <= sidebar.y);
        await page.tap("#start");
        await page.tap('[data-direction="up"]');
        assert.equal(await page.textContent("#score"), "0010");
        await advance(page);
        const session = await context.newCDPSession(page);
        await session.send("Input.dispatchTouchEvent", {
          type: "touchStart",
          touchPoints: [{ x: 200, y: 350 }],
        });
        await session.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x: 200, y: 310 }],
        });
        await session.send("Input.dispatchTouchEvent", {
          type: "touchEnd",
          touchPoints: [],
        });
        assert.equal(await page.textContent("#score"), "0020");
        for (const width of [320, 390, 640, 768]) {
          await page.setViewportSize({ width, height: 900 });
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
            true,
            `no overflow at ${width}px`,
          );
        }
        assert.deepEqual(errors, []);
        await context.close();
      },
    );

    await t.test(
      "game remains playable when browser storage is unavailable",
      async () => {
        const page = await browser.newPage();
        await page.addInitScript(() => {
          Object.defineProperty(window, "localStorage", {
            get() {
              throw new DOMException("Blocked", "SecurityError");
            },
          });
        });
        await prepare(page);
        await page.click("#start");
        await page.keyboard.press("w");
        assert.equal(await page.textContent("#score"), "0010");
        await page.close();
      },
    );
  } finally {
    await browser.close();
  }
});
