export const SIZE = 768;
export const CELL = 64;
export const COLS = 12;
export const ROUND_TIME = 60;
export const COIN_TTL = 12;
export const COIN_COUNT = 2;
export const GRENADE_SPEED = 540;
export const MAX_GRENADES = 3;
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
export const BIOMES = [
  {
    name: "JUNGLE",
    hazards: {
      4: "lion",
      5: "snake",
      6: "tiger",
      8: "snake",
      9: "bear",
      10: "lion",
    },
  },
  {
    name: "SAVANNA",
    hazards: {
      4: "lion",
      5: "hyena",
      6: "lion",
      8: "hyena",
      9: "lion",
      10: "hyena",
    },
  },
  {
    name: "ARCTIC",
    hazards: {
      4: "polar-bear",
      5: "wolf",
      6: "polar-bear",
      8: "wolf",
      9: "polar-bear",
      10: "wolf",
    },
  },
  {
    name: "VOLCANO",
    hazards: {
      4: "dinosaur",
      5: "lava",
      6: "dinosaur",
      8: "lava",
      9: "dinosaur",
      10: "lava",
    },
  },
  {
    name: "ZOO ESCAPE",
    hazards: {
      4: "tiger",
      5: "gorilla",
      6: "security",
      8: "tiger",
      9: "gorilla",
      10: "security",
    },
  },
];

export const modulo = (value, divisor) =>
  ((value % divisor) + divisor) % divisor;

export function biomeForLevel(level) {
  return BIOMES[modulo(level - 1, BIOMES.length)];
}

export function hazardType(lane, level = 1) {
  if (lane.kind !== "road") return null;
  return biomeForLevel(level).hazards[lane.row];
}

export function laneSpeed(lane, level = 1) {
  const speed = hazardType(lane, level) === "snake" ? 0 : lane.speed;
  return speed * (1 + Math.min(level - 1, 12) * 0.1);
}

export function snakesForLevel(level = 1) {
  return [
    { row: 3, x: CELL * (2 + modulo(level * 3, 9)) + CELL / 2 },
    { row: 7, x: CELL * (9 - modulo(level * 2, 9)) + CELL / 2 },
  ];
}

export function laneObjects(lane, elapsed, level = 1) {
  const spacing = lane.width + lane.gap;
  const speed = laneSpeed(lane, level);
  const traveled = lane.offset + elapsed * speed;
  const cycle = Math.floor(traveled / spacing);
  const origin = modulo(traveled, spacing) - spacing;
  return Array.from({ length: Math.ceil(SIZE / spacing) + 2 }, (_, i) => ({
    x: origin + i * spacing,
    width: lane.width,
    index: i,
    id: i - cycle - 1,
  }));
}

export function hazardAt(player, elapsed, level, wrecks = [], snakes = []) {
  if (player.x < 14 || player.x > SIZE - 14) return "water";
  if (
    snakes.some(
      (snake) => snake.row === player.row && Math.abs(snake.x - player.x) <= 24,
    )
  )
    return "snake";
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
      !wrecks.some((wreck) => wreck.row === lane.row && wreck.id === item.id) &&
      player.x + 16 > item.x + 5 &&
      player.x - 16 < item.x + item.width - 5,
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
    coins: [],
    coinTimer: 5,
    launcher: 0,
    grenade: null,
    wrecks: [],
    snakes: snakesForLevel(1),
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

export function fireGrenade(state) {
  if (
    state.mode !== "playing" ||
    state.respawn > 0 ||
    state.launcher <= 0 ||
    state.grenade
  )
    return false;
  state.launcher--;
  state.grenade = { x: state.player.x, y: state.player.row * CELL + 14 };
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
    state.player.x += laneSpeed(lane, state.level) * dt;
  state.coins = state.coins.filter((coin) => (coin.ttl -= dt) > 0);
  const collected = state.coins.find(
    (coin) =>
      coin.row === state.player.row &&
      Math.abs(coin.x - state.player.x) <= CELL / 2,
  );
  if (collected) {
    state.coins = state.coins.filter((coin) => coin !== collected);
    state.launcher = Math.min(state.launcher + 1, MAX_GRENADES);
    onEvent("coin");
  }
  if (!state.coins.length) {
    state.coinTimer -= dt;
    if (state.coinTimer <= 0) {
      const lanes = LANE_CONFIG.filter((item) => item.kind === "road");
      state.coins = Array.from({ length: COIN_COUNT }, () => {
        const lane = lanes.splice(
          Math.floor(Math.random() * lanes.length),
          1,
        )[0];
        return {
          row: lane.row,
          x: CELL / 2 + CELL * Math.floor(Math.random() * COLS),
          ttl: COIN_TTL,
        };
      });
      state.coinTimer = 9 + Math.random() * 7;
      onEvent("coin-spawn");
    }
  }
  if (state.grenade) {
    state.grenade.y -= GRENADE_SPEED * dt;
    const row = Math.floor(state.grenade.y / CELL);
    const snake = state.snakes.find(
      (item) => item.row === row && Math.abs(item.x - state.grenade.x) <= 22,
    );
    const road = LANE_CONFIG.find(
      (item) => item.row === row && item.kind === "road",
    );
    const hit = road
      ? laneObjects(road, state.elapsed, state.level).find(
          (item) =>
            !state.wrecks.some(
              (wreck) => wreck.row === road.row && wreck.id === item.id,
            ) &&
            state.grenade.x + 6 > item.x &&
            state.grenade.x - 6 < item.x + item.width,
        )
      : null;
    if (snake) {
      state.snakes = state.snakes.filter((item) => item !== snake);
      state.grenade = null;
      state.score += 25;
      onEvent("blast", { x: snake.x, y: snake.row * CELL + CELL / 2 });
    } else if (hit) {
      state.wrecks.push({
        row: road.row,
        id: hit.id,
        ...(laneSpeed(road, state.level) === 0 ? { ttl: 6 } : {}),
      });
      state.grenade = null;
      state.score += 25;
      onEvent("blast", {
        x: hit.x + hit.width / 2,
        y: road.row * CELL + CELL / 2,
      });
    } else if (state.grenade.y < -20) state.grenade = null;
  }
  state.wrecks = state.wrecks.filter((wreck) => {
    if (wreck.ttl !== undefined) {
      wreck.ttl -= dt;
      return wreck.ttl > 0;
    }
    const wreckLane = LANE_CONFIG.find((item) => item.row === wreck.row);
    const spacing = wreckLane.width + wreckLane.gap;
    const speed = laneSpeed(wreckLane, state.level);
    const x = wreckLane.offset + state.elapsed * speed + wreck.id * spacing;
    return x + wreckLane.width > -spacing && x < SIZE + spacing;
  });
  state.remaining = Math.max(0, state.remaining - dt);
  const hazard =
    hazardAt(
      state.player,
      state.elapsed,
      state.level,
      state.wrecks,
      state.snakes,
    ) || (state.remaining === 0 ? "time" : null);
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
      state.snakes = snakesForLevel(state.level);
    }
    resetPlayer(state);
    state.cooldown = 0.3;
    onEvent("goal");
  }
}
