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
      "banana spots empty in collection order and refill together",
      async () => {
        const page = await browser.newPage({
          viewport: { width: 1440, height: 1000 },
        });
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.route(
          (url) => url.pathname.endsWith("/core.mjs") && !url.search,
          (route) =>
            route.fulfill({
              contentType: "text/javascript",
              body: `
          export * from "./core.mjs?banana-test";
          import { createState as originalCreateState } from "./core.mjs?banana-test";
          export function createState() {
            const state = originalCreateState();
            globalThis.bananaTestState = state;
            return state;
          }
        `,
            }),
        );
        await prepare(page);
        await page.click("#start");
        const emptySpots = () =>
          page.evaluate(() => {
            const context = document.getElementById("game").getContext("2d");
            return [160, 384, 608].map((x) => {
              const { data } = context.getImageData(x - 24, 14, 48, 31);
              for (let i = 0; i < data.length; i += 4) {
                if (data[i] !== 60 || data[i + 1] !== 101 || data[i + 2] !== 65)
                  return false;
              }
              return true;
            });
          });
        const collectAt = async (x) => {
          await page.evaluate((position) => {
            bananaTestState.player = { x: position, row: 1 };
            bananaTestState.cooldown = 0;
            bananaTestState.furthest = 1;
          }, x);
          await page.keyboard.press("ArrowUp");
          await advance(page, 1);
        };
        assert.deepEqual(await emptySpots(), [false, false, false]);
        await collectAt(608);
        assert.deepEqual(await emptySpots(), [false, false, true]);
        assert.equal(await page.textContent("#harvest"), "1 / 3");
        await page.keyboard.press("p");
        await advance(page, 30);
        await page.click("#start");
        assert.deepEqual(await emptySpots(), [false, false, true]);
        await page.evaluate(() => {
          bananaTestState.remaining = 0;
        });
        await advance(page, 70);
        assert.equal(
          await page.getAttribute("#lives", "aria-label"),
          "2 lives",
        );
        assert.deepEqual(await emptySpots(), [false, false, true]);
        await collectAt(608);
        assert.equal(await page.textContent("#harvest"), "1 / 3");
        await advance(page);
        await page.keyboard.press("ArrowRight");
        await advance(page, 1);
        assert.deepEqual(await emptySpots(), [false, false, true]);
        await collectAt(160);
        assert.equal(await page.textContent("#harvest"), "2 / 3");
        assert.deepEqual(await emptySpots(), [true, false, true]);
        await page.screenshot({
          path: "/tmp/monkey-crossing-bananas.png",
          fullPage: true,
        });
        await collectAt(384);
        assert.equal(await page.textContent("#level"), "02");
        assert.equal(await page.textContent("#harvest"), "0 / 3");
        assert.deepEqual(await emptySpots(), [false, false, false]);
        await collectAt(160);
        await page.reload();
        await advance(page, 1);
        assert.equal(await page.textContent("#level"), "01");
        assert.equal(await page.textContent("#harvest"), "0 / 3");
        assert.deepEqual(await emptySpots(), [false, false, false]);
        assert.deepEqual(errors, []);
        await page.close();
      },
    );
    await t.test(
      "vivid level palette keeps the page styling unchanged",
      async () => {
        const page = await browser.newPage({
          viewport: { width: 1440, height: 1000 },
        });
        await prepare(page);
        await page.click("#start");
        await advance(page, 1);
        const colors = await page.evaluate(() => {
          const context = document.getElementById("game").getContext("2d");
          const pixel = (x, y) =>
            Array.from(context.getImageData(x, y, 1, 1).data).slice(0, 3);
          return {
            road: pixel(50, 310),
            blue: pixel(30, 344),
            orange: pixel(174, 288),
            yellow: pixel(310, 608),
            page: getComputedStyle(document.body).backgroundColor,
            heading: getComputedStyle(document.querySelector("h1 em")).color,
          };
        });
        assert.deepEqual(colors, {
          road: [32, 40, 46],
          blue: [23, 111, 193],
          orange: [240, 107, 36],
          yellow: [255, 197, 46],
          page: "rgb(245, 242, 233)",
          heading: "rgb(215, 105, 54)",
        });
        await page.screenshot({
          path: "/tmp/monkey-crossing-level.png",
          fullPage: true,
        });
        await page.close();
      },
    );
    await t.test(
      "coins arm the launcher and keyboard firing updates the HUD",
      async () => {
        const page = await browser.newPage({
          viewport: { width: 1440, height: 1000 },
        });
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.route(
          (url) => url.pathname.endsWith("/core.mjs") && !url.search,
          (route) =>
            route.fulfill({
              contentType: "text/javascript",
              body: `
          export * from "./core.mjs?shooter-test";
          import {
            LANE_CONFIG,
            createState as originalCreateState,
            laneObjects,
          } from "./core.mjs?shooter-test";
          globalThis.shooterTestTools = { LANE_CONFIG, laneObjects };
          export function createState() {
            const state = originalCreateState();
            globalThis.shooterTestState = state;
            return state;
          }
        `,
            }),
        );
        await prepare(page);
        await page.click("#start");
        await page.keyboard.press(" ");
        assert.match(
          await page.textContent("#announcement"),
          /GRAB A ROAD COIN/,
        );
        assert.equal(
          await page.evaluate(() => Boolean(shooterTestState.grenade)),
          false,
        );
        await page.evaluate(() => {
          shooterTestState.coinTimer = 0;
        });
        await advance(page, 1);
        assert.equal(
          await page.evaluate(() => shooterTestState.coins.length),
          2,
          "two coins are visible after each spawn",
        );
        assert.equal(
          await page.evaluate(
            () => new Set(shooterTestState.coins.map((coin) => coin.row)).size,
          ),
          2,
          "the two coins use different road lanes",
        );
        await page.evaluate(() => {
          shooterTestState.coins[0].row = shooterTestState.player.row;
          shooterTestState.coins[0].x = shooterTestState.player.x;
        });
        await advance(page, 1);
        assert.equal(await page.textContent("#shots"), "● ○ ○");
        assert.match(await page.textContent("#announcement"), /LAUNCHER ARMED/);
        await page.evaluate(() => {
          const lane = shooterTestTools.LANE_CONFIG.find(
            (item) => item.row === 10,
          );
          const car = shooterTestTools
            .laneObjects(lane, shooterTestState.elapsed, shooterTestState.level)
            .find((item) => item.x > 60 && item.x + item.width < 768 - 60);
          shooterTestState.player.x = car.x + car.width / 2;
        });
        await page.keyboard.press("b");
        assert.equal(
          await page.evaluate(() => Boolean(shooterTestState.grenade)),
          true,
        );
        assert.equal(await page.textContent("#shots"), "○ ○ ○");
        await advance(page, 1);
        assert.ok(
          await page.evaluate(() => shooterTestState.grenade.y < 718),
          "fired grenade travels up the board",
        );
        await advance(page, 2);
        assert.equal(await page.evaluate(() => shooterTestState.grenade), null);
        assert.equal(
          await page.evaluate(() => shooterTestState.wrecks.length),
          1,
        );
        assert.equal(await page.textContent("#score"), "0025");
        assert.match(
          await page.textContent("#announcement"),
          /DIRECT HIT! \+25/,
        );
        assert.deepEqual(errors, []);
        await page.close();
      },
    );
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
        const darkBefore = await page.evaluate(() =>
          document.documentElement.classList.contains("dark"),
        );
        await page.click("#dark");
        assert.equal(
          await page.getAttribute("#dark", "aria-pressed"),
          String(!darkBefore),
        );
        assert.equal(
          await page.evaluate(() =>
            document.documentElement.classList.contains("dark"),
          ),
          !darkBefore,
        );
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
        assert.equal(
          await page.evaluate(() =>
            document.documentElement.classList.contains("dark"),
          ),
          !darkBefore,
          "dark mode choice persists across reload",
        );
        assert.equal(await page.locator("#share").count(), 0);
        assert.equal(
          await page.getAttribute("#leaderboard-link", "href"),
          "#leaderboard",
        );
        await page.click("#leaderboard-link");
        assert.equal(new URL(page.url()).hash, "#leaderboard");
        assert.equal(await page.isVisible("#leaderboard"), true);
        await page.waitForFunction(
          () => document.querySelectorAll("#leaderboard-rows tr").length === 10,
          undefined,
          { polling: 100 },
        );
        assert.deepEqual(
          await page.locator("#leaderboard thead th").allTextContents(),
          ["USER", "SCORE", "RECORD", "PLATFORM"],
        );
        assert.equal(
          await page.locator("#leaderboard-rows td").nth(2).textContent(),
          "1ST",
        );
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
          userAgent:
            "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
        });
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.route(
          (url) => url.pathname.endsWith("/core.mjs") && !url.search,
          (route) =>
            route.fulfill({
              contentType: "text/javascript",
              body: `
          export * from "./core.mjs?mobile-test";
          import { createState as originalCreateState } from "./core.mjs?mobile-test";
          export function createState() {
            const state = originalCreateState();
            globalThis.mobileTestState = state;
            return state;
          }
        `,
            }),
        );
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
        await page.evaluate(() => {
          mobileTestState.launcher = 1;
        });
        await advance(page, 1);
        assert.equal(
          await page.getAttribute("#fire", "aria-label"),
          "Fire shot, 1 remaining",
        );
        await page.tap("#fire");
        assert.equal(
          await page.evaluate(() => Boolean(mobileTestState.grenade)),
          true,
        );
        assert.equal(await page.textContent("#shots"), "○ ○ ○");
        const interaction = await page.evaluate(async () => {
          const game = document.getElementById("game");
          const style = getComputedStyle(game);
          const stylesheet = await (await fetch("./style.css")).text();
          const select = new Event("selectstart", { cancelable: true });
          const context = new Event("contextmenu", { cancelable: true });
          const drag = new Event("dragstart", { cancelable: true });
          return {
            userSelect: style.userSelect,
            webkitUserSelect: style.webkitUserSelect,
            calloutLocked: stylesheet.includes("-webkit-touch-callout: none"),
            touchAction: style.touchAction,
            selectPrevented: !game.dispatchEvent(select),
            contextPrevented: !game.dispatchEvent(context),
            dragPrevented: !game.dispatchEvent(drag),
            androidAgent: navigator.userAgent.includes("Android"),
          };
        });
        assert.deepEqual(interaction, {
          userSelect: "none",
          webkitUserSelect: "none",
          calloutLocked: true,
          touchAction: "none",
          selectPrevented: true,
          contextPrevented: true,
          dragPrevented: true,
          androidAgent: true,
        });
        for (const width of [320, 390, 640, 768]) {
          await page.setViewportSize({ width, height: 900 });
          assert.equal(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= window.innerWidth,
            ),
            true,
            `no overflow at ${width}px`,
          );
          assert.equal(
            await page.evaluate(() => {
              const scoreboard = document.querySelector(".scoreboard");
              return scoreboard.scrollWidth <= scoreboard.clientWidth;
            }),
            true,
            `scoreboard fits at ${width}px`,
          );
          assert.equal(
            await page.evaluate(() => {
              const shell = document.querySelector(".board-shell");
              return (
                shell.scrollWidth <= shell.clientWidth &&
                shell.querySelector("table").scrollWidth <= shell.clientWidth
              );
            }),
            true,
            `leaderboard table fits at ${width}px`,
          );
        }
        assert.deepEqual(errors, []);
        await context.close();
      },
    );

    await t.test(
      "public leaderboard accepts a three-letter top-ten entry",
      async () => {
        const page = await browser.newPage({
          viewport: { width: 1440, height: 1200 },
        });
        const errors = [];
        const entries = [
          {
            id: "seed-run",
            initials: "BOT",
            score: 900,
            platform: "WEB",
            createdAt: 1,
          },
        ];
        let posted;
        page.on("pageerror", (error) => errors.push(error.message));
        await page.route("**/api/leaderboard", async (route) => {
          const request = route.request();
          if (request.method() === "GET") {
            await route.fulfill({
              contentType: "application/json",
              body: JSON.stringify({ entries }),
            });
            return;
          }
          if (request.method() === "POST") {
            posted = request.postDataJSON();
            entries.push(posted);
            entries.sort((a, b) => b.score - a.score);
            await route.fulfill({
              status: 201,
              contentType: "application/json",
              body: JSON.stringify({
                accepted: true,
                entry: posted,
                entries: entries.slice(0, 10),
              }),
            });
            return;
          }
          await route.fulfill({ status: 405 });
        });
        await page.route(
          (url) => url.pathname.endsWith("/core.mjs") && !url.search,
          (route) =>
            route.fulfill({
              contentType: "text/javascript",
              body: `
          export * from "./core.mjs?leaderboard-test";
          import { createState as originalCreateState } from "./core.mjs?leaderboard-test";
          export function createState() {
            const state = originalCreateState();
            globalThis.leaderboardTestState = state;
            return state;
          }
        `,
            }),
        );
        await prepare(page);
        await page.waitForFunction(
          () =>
            document.getElementById("leaderboard-status").textContent ===
            "PUBLIC BOARD · SHARED FOR EVERY CROSSER",
          undefined,
          { polling: 100 },
        );
        assert.equal(
          await page.locator("#leaderboard-rows td").nth(0).textContent(),
          "BOT",
        );
        await page.click("#start");
        await page.evaluate(() => {
          leaderboardTestState.score = 500;
          leaderboardTestState.lives = 1;
          leaderboardTestState.remaining = 0;
        });
        await advance(page, 70);
        await page.waitForFunction(
          () => !document.getElementById("score-entry").hidden,
          undefined,
          { polling: 100 },
        );
        assert.equal(await page.isVisible("#leaderboard-callout"), true);
        await page.fill("#initials", "ab1");
        assert.equal(await page.inputValue("#initials"), "AB");
        await page.click("#score-form button");
        assert.match(await page.textContent("#entry-message"), /exactly 3/i);
        await page.fill("#initials", "mky");
        await page.click("#score-form button");
        await page.waitForFunction(
          () => document.getElementById("score-entry").hidden,
          undefined,
          { polling: 100 },
        );
        assert.equal(posted.initials, "MKY");
        assert.equal(posted.score, 500);
        const record = await page
          .locator("#leaderboard-rows tr")
          .nth(1)
          .locator("td")
          .allTextContents();
        assert.deepEqual(record.slice(0, 3), ["MKY", "0500", "2ND"]);
        assert.equal(record[3], posted.platform);
        await page.reload();
        await page.waitForFunction(
          () =>
            document.querySelector("#leaderboard-rows tr:nth-child(2) td")
              ?.textContent === "MKY",
          undefined,
          { polling: 100 },
        );
        await page.screenshot({
          path: "/tmp/monkey-crossing-leaderboard.png",
          fullPage: true,
        });
        assert.deepEqual(errors, []);
        await page.close();
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
