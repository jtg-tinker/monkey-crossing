export const SIZE = 768;
export const CELL = 64;
export const COLS = 12;
export const ROUND_TIME = 60;
export const BANANA_SPOTS = [160, 384, 608];
export const LANE_CONFIG = [
  { row: 1, kind: "river", speed: 73, width: 178, gap: 94, offset: 24 },
  { row: 2, kind: "river", speed: -58, width: 216, gap: 92, offset: 85 },
  { row: 4, kind: "road", speed: -125, width: 112, gap: 185, offset: 70 },
  { row: 5, kind: "road", speed: 95, width: 77, gap: 145, offset: 20 },
  { row: 6, kind: "road", speed: -150, width: 80, gap: 205, offset: 140 },
  { row: 8, kind: "road", speed: 104, width: 78, gap: 163, offset: 60 },
  { row: 9, kind: "road", speed: -88, width: 128, gap: 194, offset: 190 },
  { row: 10, kind: "road", speed: 115, width: 80, gap: 189, offset: 10 },
];

export const modulo = (value, divisor) =>
  ((value % divisor) + divisor) % divisor;

export function laneObjects(lane, elapsed, level = 1) {
  const spacing = lane.width + lane.gap;
  const speed = lane.speed * (1 + Math.min(level - 1, 12) * 0.1);
  const origin = modulo(lane.offset + elapsed * speed, spacing) - spacing;
  return Array.from({ length: Math.ceil(SIZE / spacing) + 2 }, (_, i) => ({
    x: origin + i * spacing,
    width: lane.width,
    index: i,
  }));
}

export function hazardAt(player, elapsed, level) {
  if (player.x < 14 || player.x > SIZE - 14) return "water";
  const lane = LANE_CONFIG.find((item) => item.row === player.row);
  if (!lane) return null;
  const objects = laneObjects(lane, elapsed, level);
  if (lane.kind === "river")
    return objects.some(
      (item) => player.x >= item.x + 10 && player.x <= item.x + item.width - 10,
    )
      ? null
      : "water";
  return objects.some(
    (item) =>
      player.x + 16 > item.x + 5 && player.x - 16 < item.x + item.width - 5,
  )
    ? "car"
    : null;
}

export function createState() {
  return {
    mode: "ready",
    player: { x: CELL * 6.5, row: 11 },
    score: 0,
    level: 1,
    lives: 3,
    harvest: 0,
    collectedBananas: BANANA_SPOTS.map(() => false),
    remaining: ROUND_TIME,
    elapsed: 0,
    furthest: 11,
    cooldown: 0,
    respawn: 0,
    hop: 0,
  };
}

export function resetPlayer(state) {
  state.player = { x: CELL * 6.5, row: 11 };
  state.remaining = ROUND_TIME;
  state.furthest = 11;
  state.hop = 0;
}

export function movePlayer(state, direction) {
  if (state.mode !== "playing" || state.respawn > 0 || state.cooldown > 0)
    return false;
  const directions = {
    up: [0, -1],
    down: [0, 1],
    left: [-1, 0],
    right: [1, 0],
  };
  if (!directions[direction]) return false;
  const [dx, dy] = directions[direction];
  const x = state.player.x + dx * CELL;
  const row = state.player.row + dy;
  if (x < 16 || x > SIZE - 16 || row < 0 || row > 11) return false;
  state.player = { x, row };
  state.hop = 0.14;
  state.cooldown = 0.115;
  if (row < state.furthest) {
    state.score += (state.furthest - row) * 10;
    state.furthest = row;
  }
  return true;
}

export function step(state, dt, onEvent = () => {}) {
  if (state.mode !== "playing") return;
  state.elapsed += dt;
  state.cooldown = Math.max(0, state.cooldown - dt);
  state.hop = Math.max(0, state.hop - dt);
  if (state.respawn > 0) {
    state.respawn = Math.max(0, state.respawn - dt);
    if (state.respawn === 0) {
      if (state.lives === 0) {
        state.mode = "over";
        onEvent("over");
      } else resetPlayer(state);
    }
    return;
  }
  const lane = LANE_CONFIG.find((item) => item.row === state.player.row);
  if (lane?.kind === "river")
    state.player.x +=
      lane.speed * (1 + Math.min(state.level - 1, 12) * 0.1) * dt;
  state.remaining = Math.max(0, state.remaining - dt);
  const hazard =
    hazardAt(state.player, state.elapsed, state.level) ||
    (state.remaining === 0 ? "time" : null);
  if (hazard) {
    state.lives--;
    state.respawn = 1.05;
    onEvent(hazard);
  } else if (state.player.row === 0) {
    const index = BANANA_SPOTS.findIndex(
      (x) => Math.abs(state.player.x - x) <= CELL / 2,
    );
    if (index === -1 || state.collectedBananas[index]) return;
    state.collectedBananas[index] = true;
    state.score += 100 + Math.ceil(state.remaining) * 2;
    state.harvest++;
    if (state.harvest === BANANA_SPOTS.length) {
      state.level++;
      state.harvest = 0;
      state.collectedBananas.fill(false);
    }
    resetPlayer(state);
    state.cooldown = 0.3;
    onEvent("goal");
  }
}
