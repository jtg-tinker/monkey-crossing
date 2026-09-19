import test from "node:test";
import assert from "node:assert/strict";
import {
  SIZE,
  CELL,
  LANE_CONFIG,
  COIN_COUNT,
  MAX_GRENADES,
  BIOMES,
  laneObjects,
  biomeForLevel,
  hazardType,
  laneSpeed,
  snakesForLevel,
  hazardAt,
  createState,
  movePlayer,
  fireGrenade,
  step,
} from "./core.mjs";

const playing = () => ({ ...createState(), mode: "playing" });

function emptyRoadX(lane, elapsed = 0, level = 1) {
  const cars = laneObjects(lane, elapsed, level).sort((a, b) => a.x - b.x);
  for (let i = 1; i < cars.length; i++) {
    const mid = (cars[i - 1].x + cars[i - 1].width + cars[i].x) / 2;
    if (mid > 40 && mid < SIZE - 40) return mid;
  }
}

test("starts with three lives, a full timer, and a safe monkey", () => {
  const state = createState();
  assert.equal(state.lives, 3);
  assert.equal(state.remaining, 60);
  assert.deepEqual(state.coins, []);
  assert.equal(state.launcher, 0);
  assert.equal(state.grenade, null);
  assert.deepEqual(state.wrecks, []);
  assert.deepEqual(state.snakes, snakesForLevel(1));
  assert.equal(hazardAt(state.player, 0, 1), null);
  assert.equal(movePlayer(state, "up"), false);
});

test("movement is bounded, rate limited, and only rewards new forward progress", () => {
  const state = playing();
  assert.equal(movePlayer(state, "down"), false);
  assert.equal(movePlayer(state, "up"), true);
  assert.equal(state.score, 10);
  assert.equal(movePlayer(state, "up"), false);
  state.cooldown = 0;
  movePlayer(state, "down");
  state.cooldown = 0;
  movePlayer(state, "up");
  assert.equal(state.score, 10);
  state.cooldown = 0;
  state.player.x = CELL / 2;
  assert.equal(movePlayer(state, "left"), false);
  state.player.x = SIZE - CELL / 2;
  assert.equal(movePlayer(state, "right"), false);
});

test("hazard collision costs exactly one life and respawns safely", () => {
  const state = playing();
  const lane = LANE_CONFIG.find((lane) => lane.kind === "road");
  const car = laneObjects(lane, 0).find(
    (car) => car.x > 0 && car.x < SIZE - car.width,
  );
  state.player = { row: lane.row, x: car.x + car.width / 2 };
  const events = [];
  step(state, 0, (event) => events.push(event));
  assert.equal(state.lives, 2);
  assert.deepEqual(events, ["car"]);
  step(state, 0.5, (event) => events.push(event));
  assert.equal(state.lives, 2);
  step(state, 0.6);
  assert.equal(state.player.row, 11);
  assert.equal(state.remaining, 60);
});

test("logs support and carry the monkey, while water gaps are fatal", () => {
  const state = playing();
  const lane = LANE_CONFIG[0];
  const log = laneObjects(lane, 0).find((log) => log.x > 0);
  state.player = { row: lane.row, x: log.x + log.width / 2 };
  const originalX = state.player.x;
  step(state, 0.1);
  assert.equal(state.lives, 3);
  assert.ok(Math.abs(state.player.x - originalX - lane.speed * 0.1) < 0.001);
  const movedLog = laneObjects(lane, state.elapsed).find((log) => log.x > 0);
  state.player.x = movedLog.x + movedLog.width + lane.gap / 2;
  const events = [];
  step(state, 0, (event) => events.push(event));
  assert.deepEqual(events, ["water"]);
  assert.equal(state.lives, 2);
});

test("drifting outside the river boundary is fatal", () => {
  assert.equal(hazardAt({ row: 1, x: -1 }, 0, 1), "water");
  assert.equal(hazardAt({ row: 2, x: SIZE + 1 }, 0, 1), "water");
});

test("each banana is collected from its own location", () => {
  for (const [index, x] of [160, 384, 608].entries()) {
    const state = playing();
    state.player = { x, row: 0 };
    step(state, 0);
    assert.deepEqual(
      state.collectedBananas,
      [0, 1, 2].map((slot) => slot === index),
    );
    assert.equal(state.harvest, 1);
    assert.equal(state.score, 220);
    assert.equal(state.player.row, 11);
  }
});

test("revisiting an empty spot does not collect another banana", () => {
  const state = playing();
  const events = [];
  state.player = { x: 608, row: 0 };
  step(state, 0, (event) => events.push(event));
  const score = state.score;
  state.player = { x: 608, row: 0 };
  step(state, 0, (event) => events.push(event));
  step(state, 0.5, (event) => events.push(event));
  assert.equal(state.harvest, 1);
  assert.equal(state.score, score);
  assert.equal(state.player.row, 0);
  assert.equal(state.lives, 3);
  assert.deepEqual(state.collectedBananas, [false, false, true]);
  assert.deepEqual(events, ["goal"]);
});

test("reaching the grove between banana spots does not collect one", () => {
  for (const x of [32, 96, 256, 480, 736]) {
    const state = playing();
    state.player = { x, row: 0 };
    step(state, 0);
    assert.equal(state.harvest, 0);
    assert.equal(state.score, 0);
    assert.equal(state.player.row, 0);
    assert.equal(state.lives, 3);
  }
});

test("collection respects the width of each visible banana spot", () => {
  for (const center of [160, 384, 608]) {
    for (const offset of [-32, 32, -32.1, 32.1]) {
      const state = playing();
      state.player = { x: center + offset, row: 0 };
      step(state, 0);
      assert.equal(state.harvest, Math.abs(offset) <= 32 ? 1 : 0);
    }
  }
});

test("the monkey can move along the grove to an uncollected banana", () => {
  const state = playing();
  state.player = { x: 256, row: 0 };
  movePlayer(state, "right");
  step(state, 0);
  assert.equal(state.harvest, 0);
  state.cooldown = 0;
  movePlayer(state, "right");
  step(state, 0);
  assert.equal(state.harvest, 1);
  assert.deepEqual(state.collectedBananas, [false, true, false]);
});

test("collected spots stay empty after losing a life", () => {
  const state = playing();
  state.player = { x: 384, row: 0 };
  step(state, 0);
  state.remaining = 0;
  step(state, 0);
  step(state, 1.1);
  assert.equal(state.lives, 2);
  assert.equal(state.player.row, 11);
  assert.equal(state.harvest, 1);
  assert.deepEqual(state.collectedBananas, [false, true, false]);
});

test("all three distinct bananas reset together for the next level", () => {
  const state = playing();
  const events = [];
  for (const [index, x] of [608, 160, 384].entries()) {
    state.player = { x, row: 0 };
    step(state, 0, (event) => events.push(event));
    assert.equal(state.player.row, 11);
    assert.equal(state.level, index === 2 ? 2 : 1);
    assert.equal(state.harvest, (index + 1) % 3);
  }
  assert.equal(state.score, 660);
  assert.deepEqual(state.collectedBananas, [false, false, false]);
  assert.deepEqual(events, ["goal", "goal", "goal"]);
  state.player = { x: 608, row: 0 };
  step(state, 0);
  assert.equal(state.harvest, 1);
  assert.deepEqual(state.collectedBananas, [false, false, true]);
});

test("new games have independent, fully stocked banana spots", () => {
  const state = playing();
  state.player = { x: 160, row: 0 };
  step(state, 0);
  assert.deepEqual(createState().collectedBananas, [false, false, false]);
  assert.deepEqual(state.collectedBananas, [true, false, false]);
});

test("timer expiry leads to game over on the final life", () => {
  const state = playing();
  state.remaining = 0.01;
  state.lives = 1;
  const events = [];
  step(state, 0.02, (event) => events.push(event));
  assert.equal(state.lives, 0);
  assert.equal(state.remaining, 0);
  assert.equal(movePlayer(state, "up"), false);
  step(state, 1.1, (event) => events.push(event));
  assert.equal(state.mode, "over");
  assert.deepEqual(events, ["time", "over"]);
});

test("pausing freezes gameplay and ignores moves", () => {
  const state = playing();
  state.mode = "paused";
  const snapshot = structuredClone(state);
  step(state, 10);
  assert.equal(movePlayer(state, "up"), false);
  assert.deepEqual(state, snapshot);
});

test("levels rotate through themed biomes and animal hazards", () => {
  assert.deepEqual(
    BIOMES.map((biome) => biome.name),
    ["JUNGLE", "SAVANNA", "ARCTIC", "VOLCANO", "ZOO ESCAPE"],
  );
  assert.equal(biomeForLevel(1).name, "JUNGLE");
  assert.equal(biomeForLevel(6).name, "JUNGLE");
  const snakeLane = LANE_CONFIG.find((item) => item.row === 8);
  assert.equal(hazardType(snakeLane, 1), "snake");
  assert.equal(laneSpeed(snakeLane, 1), 0);
  assert.notEqual(laneSpeed(snakeLane, 2), 0);
});

test("stationary snakes ambush the monkey", () => {
  const state = playing();
  const snake = state.snakes[0];
  state.player = { row: snake.row, x: snake.x };
  const events = [];
  step(state, 0, (event) => events.push(event));
  assert.equal(state.lives, 2);
  assert.deepEqual(events, ["snake"]);
});

test("a grenade clears an ambush snake for bonus points", () => {
  const state = playing();
  const snake = state.snakes[1];
  state.grenade = {
    x: snake.x,
    y: snake.row * CELL + CELL / 2 + 10,
  };
  const events = [];
  step(state, 1 / 120, (event) => events.push(event));
  assert.equal(state.grenade, null);
  assert.equal(state.snakes.length, 1);
  assert.equal(state.score, 25);
  assert.deepEqual(events, ["blast"]);
});

test("snake positions rotate as levels change", () => {
  assert.notDeepEqual(snakesForLevel(1), snakesForLevel(2));
});

test("two coins spawn on hazard lanes and expire uncollected", () => {
  const state = playing();
  state.coinTimer = 0.01;
  const events = [];
  step(state, 0.02, (event) => events.push(event));
  assert.equal(state.coins.length, COIN_COUNT);
  for (const coin of state.coins) {
    assert.ok(
      LANE_CONFIG.filter((lane) => lane.kind === "road")
        .map((lane) => lane.row)
        .includes(coin.row),
    );
    assert.ok(coin.x > 0 && coin.x < SIZE);
  }
  assert.equal(
    new Set(state.coins.map((coin) => coin.row)).size,
    COIN_COUNT,
    "each coin gets its own hazard lane",
  );
  assert.deepEqual(events, ["coin-spawn"]);
  state.player = { row: 0, x: 96 };
  for (const coin of state.coins) coin.ttl = 0.05;
  step(state, 0.1);
  assert.deepEqual(state.coins, []);
});

test("grabbing a lane coin arms the grenade launcher", () => {
  const state = playing();
  const lane = LANE_CONFIG.find((item) => item.row === 8);
  const x = emptyRoadX(lane);
  state.coins = [{ row: 8, x, ttl: 5 }];
  state.player = { row: 8, x };
  const events = [];
  step(state, 0, (event) => events.push(event));
  assert.equal(state.launcher, 1);
  assert.deepEqual(state.coins, []);
  assert.deepEqual(events, ["coin"]);
  state.launcher = MAX_GRENADES;
  state.coins = [{ row: 8, x, ttl: 5 }];
  step(state, 0);
  assert.equal(state.launcher, MAX_GRENADES);
});

test("the launcher needs a coin and fires one grenade at a time", () => {
  const state = playing();
  assert.equal(fireGrenade(state), false);
  state.launcher = 1;
  assert.equal(fireGrenade(state), true);
  assert.equal(state.launcher, 0);
  assert.ok(state.grenade);
  state.launcher = 1;
  assert.equal(fireGrenade(state), false);
  assert.equal(state.launcher, 1);
});

test("a launched grenade travels upward through the lanes", () => {
  const state = playing();
  state.player = { row: 7, x: 96 };
  state.launcher = 1;
  fireGrenade(state);
  const y = state.grenade.y;
  step(state, 0.02);
  assert.ok(state.grenade.y < y);
});

test("a grenade wrecks the first hazard it reaches and clears it", () => {
  const state = playing();
  const lane = LANE_CONFIG.find((item) => item.row === 10);
  const car = laneObjects(lane, 0).find(
    (object) => object.x > 60 && object.x + object.width < SIZE - 60,
  );
  const x = car.x + car.width / 2;
  state.player = { row: 11, x };
  state.launcher = 1;
  const events = [];
  assert.equal(fireGrenade(state), true);
  step(state, 0.05, (event) => events.push(event));
  assert.equal(state.grenade, null);
  assert.deepEqual(state.wrecks, [{ row: 10, id: car.id }]);
  assert.equal(state.score, 25);
  assert.deepEqual(events, ["blast"]);
  assert.equal(
    hazardAt({ row: 10, x }, state.elapsed, state.level, state.wrecks),
    null,
  );
  state.player = { row: 10, x };
  step(state, 0);
  assert.equal(state.lives, 3);
});

test("a grenade that reaches the top fizzles harmlessly", () => {
  const state = playing();
  state.player = { row: 0, x: 256 };
  state.launcher = 1;
  const events = [];
  fireGrenade(state);
  step(state, 0.1, (event) => events.push(event));
  assert.equal(state.grenade, null);
  assert.equal(state.wrecks.length, 0);
  assert.deepEqual(events, []);
});

test("wrecks are forgotten once the hazard leaves or recovers", () => {
  const state = playing();
  state.wrecks = [{ row: 10, id: -9999 }];
  step(state, 0.01);
  assert.equal(state.wrecks.length, 0);
});

test("lane objects cover the screen at high levels and long elapsed times", () => {
  for (const lane of LANE_CONFIG)
    for (const elapsed of [0, 1, 123, 99999]) {
      const objects = laneObjects(lane, elapsed, 99);
      assert.ok(objects[0].x <= 0);
      assert.ok(objects.at(-1).x + lane.width >= SIZE);
      for (let i = 1; i < objects.length; i++)
        assert.ok(
          Math.abs(objects[i].x - objects[i - 1].x - lane.width - lane.gap) <
            0.001,
        );
    }
});
