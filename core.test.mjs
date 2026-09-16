import test from "node:test";
import assert from "node:assert/strict";
import {
  SIZE,
  CELL,
  LANE_CONFIG,
  laneObjects,
  hazardAt,
  createState,
  movePlayer,
  step,
} from "./core.mjs";

const playing = () => ({ ...createState(), mode: "playing" });

test("starts with three lives, a full timer, and a safe monkey", () => {
  const state = createState();
  assert.equal(state.lives, 3);
  assert.equal(state.remaining, 60);
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

test("traffic collision costs exactly one life and respawns safely", () => {
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

test("three crossings award bonuses and advance the level", () => {
  const state = playing();
  const events = [];
  for (let i = 0; i < 3; i++) {
    state.player.row = 0;
    step(state, 0, (event) => events.push(event));
    assert.equal(state.player.row, 11);
  }
  assert.equal(state.level, 2);
  assert.equal(state.harvest, 0);
  assert.equal(state.score, 660);
  assert.deepEqual(events, ["goal", "goal", "goal"]);
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
