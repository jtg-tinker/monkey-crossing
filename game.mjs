import {
  SIZE,
  CELL,
  LANE_CONFIG,
  ROUND_TIME,
  BANANA_SPOTS,
  laneObjects,
  biomeForLevel,
  hazardType,
  createState,
  movePlayer,
  fireGrenade,
  MAX_GRENADES,
  step,
} from "./core.mjs";
import {
  LEADERBOARD_LIMIT,
  createEntry,
  entryId,
  mergeEntries,
  normalizeInitials,
  ordinal,
  qualifies,
  sortEntries,
} from "./leaderboard-core.mjs";

const $ = (id) => document.getElementById(id);
const canvas = $("game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;
let state = createState();
let best = 0;
let blood = true;
let sound = false;
let dark = matchMedia("(prefers-color-scheme: dark)").matches;
let bnw = false;
try {
  best = Number(localStorage.getItem("monkey-crossing-best")) || 0;
  blood = localStorage.getItem("monkey-crossing-blood") !== "false";
  const storedDark = localStorage.getItem("monkey-crossing-dark");
  if (storedDark !== null) dark = storedDark === "true";
  bnw = localStorage.getItem("monkey-crossing-bnw") === "true";
} catch {}
let audio;
let particles = [];
let stains = [];
let shake = 0;
let announcementTimer;
let toastTimer;
let sceneryTime = 0;
let lastTime = 0;
let leaderboardEntries = [];
let leaderboardReady = false;
let leaderboardOnline = false;
let leaderboardRequest;
let pendingScore;
let submittedEntryId;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const BIOME_STYLES = {
  JUNGLE: {
    safe: "#75a53c",
    canopy: "#397e38",
    safeEdge: "#477532",
    grass: "#a3ca58",
    water: "#168f9b",
    waterEdge: "#106e7b",
    wave: "#60c8c4",
    waveDark: "#39b2b4",
    spot: "#3c6541",
    spotEdge: "#9caf64",
    ground: "#24442f",
    edge: "#6f9a4c",
    marking: "#d8ca6d",
    detail: "#4f8b42",
    caption: "#d4dfb2",
  },
  SAVANNA: {
    safe: "#d0a84b",
    canopy: "#a67630",
    safeEdge: "#9a7131",
    grass: "#f0d276",
    water: "#3f9b98",
    waterEdge: "#2d7775",
    wave: "#8fd0bd",
    waveDark: "#62b1a6",
    spot: "#8f6a32",
    spotEdge: "#efd17a",
    ground: "#b48335",
    edge: "#f0cf73",
    marking: "#79552d",
    detail: "#d6ad55",
    caption: "#65471f",
  },
  ARCTIC: {
    safe: "#d9efeb",
    canopy: "#9fc9cd",
    safeEdge: "#b7d7d4",
    grass: "#f4fff7",
    water: "#2d7f98",
    waterEdge: "#236274",
    wave: "#a5dde5",
    waveDark: "#73b9c7",
    spot: "#6c9aa2",
    spotEdge: "#f4fff7",
    ground: "#83abb4",
    edge: "#edf5e9",
    marking: "#4f7a85",
    detail: "#d9efeb",
    caption: "#315b63",
  },
  VOLCANO: {
    safe: "#66503f",
    canopy: "#44322c",
    safeEdge: "#8f6043",
    grass: "#d08143",
    water: "#b43c24",
    waterEdge: "#7e2b25",
    wave: "#f6cd55",
    waveDark: "#e06b33",
    spot: "#3e302b",
    spotEdge: "#f2a43a",
    ground: "#3d2d2a",
    edge: "#e06b33",
    marking: "#f2a43a",
    detail: "#7c4430",
    caption: "#f4bd75",
  },
  "ZOO ESCAPE": {
    safe: "#75807a",
    canopy: "#4d5d5a",
    safeEdge: "#a8b1a0",
    grass: "#bcc7ad",
    water: "#3f8a95",
    waterEdge: "#2b646e",
    wave: "#8fc3c7",
    waveDark: "#66a4ac",
    spot: "#53635f",
    spotEdge: "#d9d1a6",
    ground: "#394247",
    edge: "#d9d1a6",
    marking: "#8fc3c7",
    detail: "#65737a",
    caption: "#e7e1bb",
  },
};
const HAZARD_NAMES = {
  lion: "LION",
  tiger: "TIGER",
  bear: "BEAR",
  hyena: "HYENA",
  wolf: "WOLF",
  "polar-bear": "POLAR BEAR",
  dinosaur: "DINOSAUR",
  lava: "LAVA",
  gorilla: "GORILLA",
  security: "SECURITY VEHICLE",
  snake: "SNAKE",
};

function rect(x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}
function ellipse(x, y, rx, ry, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
}
function text(value, x, y, size, color, align = "left") {
  ctx.fillStyle = color;
  ctx.font = `bold ${size}px monospace`;
  ctx.textAlign = align;
  ctx.fillText(value, x, y);
}
function save(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {}
}

function playTone(type) {
  if (!sound || !audio) return;
  const notes = {
    hop: [320, 470, 0.07],
    car: [100, 32, 0.26],
    snake: [260, 90, 0.22],
    water: [220, 55, 0.23],
    goal: [570, 1140, 0.3],
    coin: [700, 1180, 0.12],
    "coin-spawn": [480, 680, 0.1],
    launch: [210, 90, 0.16],
    blast: [80, 28, 0.45],
    time: [170, 70, 0.3],
    start: [290, 580, 0.15],
  };
  const [from, to, duration] = notes[type] || notes.hop;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = type === "car" || type === "blast" ? "sawtooth" : "square";
  oscillator.frequency.setValueAtTime(from, audio.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(
    to,
    audio.currentTime + duration,
  );
  gain.gain.setValueAtTime(0.035, audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + duration);
  oscillator.connect(gain);
  gain.connect(audio.destination);
  oscillator.start();
  oscillator.stop(audio.currentTime + duration);
}

function unlockAudio() {
  if (!sound) return;
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) return;
  audio ||= new Audio();
  if (audio.state === "suspended") audio.resume().catch(() => {});
}

function banana(x, y, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  rect(-11, -10, 6, 16, "#ffe093");
  rect(-8, 3, 8, 9, "#f5c34e");
  rect(-2, 8, 15, 7, "#f5c34e");
  rect(10, 2, 9, 9, "#f5c34e");
  rect(16, -9, 6, 15, "#f5c34e");
  rect(17, -14, 4, 6, "#6b532d");
  rect(-11, -13, 5, 5, "#6b532d");
  rect(-4, 6, 15, 3, "#ffe093");
  ctx.restore();
}

function shrub(x, y, scale = 1, biome = "JUNGLE") {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  if (biome === "SAVANNA") {
    rect(-4, -8, 8, 22, "#7a542a");
    rect(-17, -11, 34, 7, "#8f6a32");
    rect(-12, -18, 25, 9, "#a97832");
    rect(-19, 8, 9, 4, "#efd17a");
    rect(10, 6, 11, 4, "#d6ad55");
  } else if (biome === "ARCTIC") {
    rect(-3, -1, 6, 18, "#5b4c3a");
    rect(-14, -15, 28, 8, "#2f6657");
    rect(-11, -22, 22, 8, "#3f7a68");
    rect(-8, -29, 16, 8, "#558d79");
    rect(-14, -17, 28, 4, "#f4fff7");
    rect(-9, -25, 18, 3, "#f4fff7");
  } else if (biome === "VOLCANO") {
    rect(-18, 2, 16, 14, "#463b36");
    rect(-9, -8, 20, 24, "#5a4a42");
    rect(8, 0, 15, 16, "#3d2d2a");
    rect(-7, -2, 4, 11, "#f06b24");
    rect(1, -5, 3, 8, "#f6cd55");
  } else if (biome === "ZOO ESCAPE") {
    rect(-16, 3, 32, 15, "#53635f");
    rect(-14, -14, 4, 17, "#a8b1a0");
    rect(0, -14, 4, 17, "#a8b1a0");
    rect(14, -14, 4, 17, "#a8b1a0");
    rect(-18, -4, 36, 4, "#d9d1a6");
  } else {
    rect(-16, -5, 34, 15, "#307638");
    rect(-11, -14, 24, 25, "#307638");
    rect(-18, -3, 13, 9, "#205d32");
    rect(-7, -17, 13, 12, "#4b9236");
    rect(8, -9, 8, 11, "#4b9236");
    rect(-8, -9, 4, 4, "#8fba43");
  }
  ctx.restore();
}

function drawZoneDetail(name, x, y, style) {
  if (name === "JUNGLE") {
    rect(x, y, 4, 14, style.detail);
    rect(x - 5, y + 5, 14, 4, "#67a24b");
    rect(x + 3, y - 4, 4, 8, "#315f35");
  } else if (name === "SAVANNA") {
    rect(x, y + 7, 3, 9, style.detail);
    rect(x + 5, y + 3, 3, 13, "#8f6a32");
    rect(x + 10, y + 8, 3, 8, "#efd17a");
  } else if (name === "ARCTIC") {
    rect(x, y + 9, 22, 3, style.detail);
    rect(x + 8, y + 4, 3, 8, "#f4fff7");
    rect(x + 14, y + 13, 9, 2, "#5e8d96");
  } else if (name === "VOLCANO") {
    rect(x, y + 11, 16, 4, style.detail);
    rect(x + 4, y + 5, 4, 8, "#f06b24");
    rect(x + 10, y + 1, 3, 5, "#f6cd55");
  } else {
    rect(x, y + 3, 3, 15, style.detail);
    rect(x + 11, y + 3, 3, 15, style.detail);
    rect(x - 2, y + 8, 20, 3, "#d9d1a6");
  }
}

function drawGround() {
  const biome = biomeForLevel(state.level);
  const zone = BIOME_STYLES[biome.name];
  rect(0, 0, SIZE, SIZE, zone.safe);
  for (const row of [0, 3, 7, 11]) {
    const y = row * CELL;
    rect(0, y, SIZE, CELL, row === 0 ? zone.canopy : zone.safe);
    rect(0, y + CELL - 5, SIZE, 5, zone.safeEdge);
    for (let i = 0; i < 35; i++) {
      const x = (i * 97 + row * 43) % SIZE;
      const ty = y + 8 + ((i * 17) % 42);
      rect(x, ty, 3, 6, zone.grass);
      rect(x + 5, ty + 3, 3, 3, zone.grass);
    }
  }
  rect(0, CELL, SIZE, CELL * 2, zone.water);
  for (let row = 1; row <= 2; row++) {
    rect(0, row * CELL, SIZE, 4, zone.waterEdge);
    for (let i = 0; i < 21; i++) {
      const x =
        (((i * 79 + Math.sin(sceneryTime * 0.7 + i) * 13) % SIZE) + SIZE) %
        SIZE;
      const y = row * CELL + 14 + ((i * 19) % 42);
      rect(x, y, 17 + (i % 3) * 5, 3, zone.wave);
      rect(x + 9, y + 5, 8, 2, zone.waveDark);
    }
  }
  for (const start of [4, 8]) {
    rect(0, start * CELL, SIZE, CELL * 3, zone.ground);
    rect(0, start * CELL, SIZE, 5, zone.edge);
    rect(0, (start + 3) * CELL - 5, SIZE, 5, zone.edge);
    for (let line = 1; line < 3; line++)
      for (let x = 15; x < SIZE; x += 70)
        rect(x, (start + line) * CELL - 2, 32, 3, zone.marking);
    for (let i = 0; i < 18; i++)
      drawZoneDetail(
        biome.name,
        (i * 139 + start * 31) % SIZE,
        start * CELL + 13 + ((i * 31) % 165),
        zone,
      );
    text(biome.name, SIZE / 2, start * CELL + 14, 8, zone.edge, "center");
  }
  for (const row of [3, 7, 11]) {
    shrub(17, row * CELL + 32, 1.2, biome.name);
    shrub(SIZE - 17, row * CELL + 35, 1.1, biome.name);
    if (row !== 11) {
      shrub(115, row * CELL + 19, 0.55, biome.name);
      shrub(647, row * CELL + 19, 0.55, biome.name);
    }
  }
  for (const [index, x] of BANANA_SPOTS.entries()) {
    rect(x - 31, 7, 64, 49, zone.spot);
    rect(x - 27, 7, 56, 4, zone.spotEdge);
    if (!state.collectedBananas[index]) banana(x - 2, 26, 1.1);
  }
  shrub(31, 27, 1.4, biome.name);
  shrub(736, 29, 1.4, biome.name);
  text("BANANA GROVE", SIZE / 2, 60, 8, zone.spotEdge, "center");
  text(
    "↑  SURVIVE THE WILD  ↑",
    SIZE / 2,
    SIZE - 10,
    10,
    zone.caption,
    "center",
  );
}

function drawLog(x, y, width) {
  rect(x + 4, y + 13, width, 43, "#326c743d");
  rect(x, y + 10, width, 40, "#75533a");
  rect(x + 4, y + 7, width - 8, 43, "#aa7950");
  rect(x + 7, y + 10, width - 14, 7, "#c89a64");
  rect(x + 7, y + 43, width - 14, 7, "#815b3c");
  rect(x + 6, y + 15, 8, 25, "#d4a673");
  rect(x + width - 14, y + 15, 8, 25, "#d4a673");
  for (let i = 26; i < width - 20; i += 31) {
    rect(x + i, y + 23, 20, 3, "#825b3c");
    rect(x + i + 7, y + 34, 12, 3, "#bf8b58");
  }
}

function drawCoin(x, y) {
  const wobble = Math.abs(Math.sin(sceneryTime * 5));
  ctx.globalAlpha = 0.5 + Math.sin(sceneryTime * 6) * 0.2;
  ellipse(x, y - 1, 16, 16, "#f6cd5533");
  ctx.globalAlpha = 1;
  ellipse(x, y + 15, 11, 4, "#203a3138");
  ellipse(x, y, 6 + wobble * 7, 12, "#9a6b1d");
  ellipse(x, y - 1, 5 + wobble * 6, 10, "#ffd94e");
  if (wobble > 0.55) rect(x - 2, y - 7, 4, 11, "#fff0b0");
}

function drawGrenade(x, y) {
  rect(x - 1, y + 5, 3, 12, "#ff9b3d");
  rect(x - 2, y + 5, 5, 7, "#ffd94e");
  rect(x - 4, y - 4, 8, 9, "#33402f");
  rect(x - 2, y - 7, 4, 4, "#8a9a7d");
}

function drawQuadruped(
  width,
  { body, belly, face, mane, stripes, spots, shaggy },
) {
  for (const x of [12, width * 0.38, width * 0.64, width - 20])
    rect(x, 39, 8, 12, "#3b2b22");
  rect(8, 25, width - 20, 19, body);
  rect(14, 37, width - 32, 7, belly);
  rect(3, 29, 10, 4, body);
  ellipse(width - 14, 29, mane ? 16 : 11, mane ? 15 : 11, mane || face);
  ellipse(width - 7, 30, 8, 7, face);
  if (shaggy) {
    rect(10, 21, 12, 6, face);
    rect(26, 20, 11, 7, face);
  }
  if (stripes)
    for (let x = 18; x < width - 23; x += 15) rect(x, 25, 4, 19, "#2b241e");
  if (spots)
    for (let x = 18; x < width - 25; x += 18)
      ellipse(x, 31 + (x % 3), 3, 3, "#473624");
  rect(width - 15, 17, 5, 7, face);
  rect(width - 6, 18, 4, 6, face);
  rect(width - 7, 27, 3, 3, "#1c211d");
  rect(width - 3, 32, 5, 3, "#f1d9b0");
}

function drawSnakeBody(width) {
  ellipse(width * 0.42, 43, width * 0.32, 10, "#285f35");
  ellipse(width * 0.56, 37, width * 0.25, 9, "#3f8a45");
  ellipse(width * 0.68, 31, width * 0.17, 8, "#5aa64c");
  ellipse(width - 12, 25, 10, 8, "#6db457");
  rect(width - 8, 22, 3, 3, "#17251a");
  rect(width - 3, 28, 8, 2, "#c84432");
  for (let x = 12; x < width - 22; x += 13)
    rect(x, 38 + (x % 2) * 2, 5, 3, "#d5c45f");
}

function drawDinosaur(width) {
  rect(4, 32, 15, 8, "#3f7a38");
  rect(13, 24, width - 33, 21, "#4f8f3f");
  rect(width - 24, 18, 23, 16, "#5da448");
  rect(width - 12, 24, 12, 8, "#5da448");
  rect(width - 2, 30, 5, 3, "#fff1cf");
  rect(width - 18, 20, 3, 3, "#18251c");
  for (let x = 18; x < width - 28; x += 15) rect(x, 18, 7, 7, "#2c6330");
  for (const x of [18, width * 0.55]) rect(x, 42, 9, 11, "#386f34");
}

function drawGorilla(width) {
  ellipse(width * 0.45, 35, width * 0.3, 18, "#2d312d");
  ellipse(width * 0.46, 36, width * 0.18, 11, "#64645b");
  ellipse(width - 15, 20, 13, 11, "#262a27");
  rect(width - 13, 15, 4, 4, "#d8c6a7");
  for (const x of [8, width - 18]) rect(x, 26, 9, 27, "#252925");
  rect(8, 48, 15, 6, "#252925");
  rect(width - 25, 48, 15, 6, "#252925");
}

function drawLava(width) {
  ellipse(width / 2, 38, width * 0.36, 16, "#4a2926");
  ellipse(width / 2, 35, width * 0.27, 12, "#e2572b");
  ellipse(width / 2 - 4, 33, width * 0.15, 7, "#ffb13b");
  rect(width * 0.35, 14, 8, 18, "#f06b24");
  rect(width * 0.48, 9, 7, 20, "#f6cd55");
  rect(width * 0.6, 16, 6, 14, "#e2572b");
}

function drawSecurity(width) {
  for (const wheel of [12, width - 25]) {
    rect(wheel, 10, 15, 8, "#171c1a");
    rect(wheel, 47, 15, 8, "#171c1a");
  }
  rect(2, 18, width - 4, 30, "#31485a");
  rect(8, 14, width - 20, 32, "#e2e7df");
  rect(14, 19, width - 39, 10, "#6d9dad");
  rect(width - 26, 19, 16, 10, "#6d9dad");
  rect(width * 0.42, 10, 10, 5, "#d94f3d");
  rect(width * 0.55, 10, 10, 5, "#176fc1");
  rect(5, 30, width - 10, 5, "#26343d");
}

function drawStunned(width) {
  ctx.globalAlpha = 0.78;
  ellipse(width / 2, 38, width * 0.42, 18, "#171f1d");
  ctx.globalAlpha = 1;
  const flicker = Math.sin(sceneryTime * 18) > 0;
  text("✶", width * 0.33, 18, 13, flicker ? "#f6cd55" : "#ff9b3d", "center");
  text("✶", width * 0.62, 14, 10, flicker ? "#ff9b3d" : "#f6cd55", "center");
}

function drawHazard(x, y, width, direction, type, wrecked, biome) {
  ctx.save();
  if (direction < 0) {
    ctx.translate(x + width, y);
    ctx.scale(-1, 1);
  } else ctx.translate(x, y);
  rect(2, 50, width, 8, "#17251c55");
  if (type === "lion")
    drawQuadruped(
      width,
      biome === "SAVANNA"
        ? {
            body: "#8f5a1c",
            belly: "#b57e33",
            face: "#9c6622",
            mane: "#452a12",
          }
        : {
            body: "#c98635",
            belly: "#e0aa55",
            face: "#dca24b",
            mane: "#744321",
          },
    );
  else if (type === "tiger")
    drawQuadruped(width, {
      body: "#e47b2d",
      belly: "#f4bf69",
      face: "#e9903d",
      stripes: true,
    });
  else if (type === "bear")
    drawQuadruped(width, {
      body: "#6b4329",
      belly: "#8b5a38",
      face: "#7a4e30",
      shaggy: true,
    });
  else if (type === "hyena")
    drawQuadruped(width, {
      body: "#655030",
      belly: "#8f744a",
      face: "#755c37",
      spots: true,
      shaggy: true,
    });
  else if (type === "wolf")
    drawQuadruped(width, {
      body: "#68777a",
      belly: "#9aa8a4",
      face: "#77888b",
    });
  else if (type === "polar-bear")
    drawQuadruped(width, {
      body: "#e4e8df",
      belly: "#f4f0e4",
      face: "#e9ecdf",
      shaggy: true,
    });
  else if (type === "snake") drawSnakeBody(width);
  else if (type === "dinosaur") drawDinosaur(width);
  else if (type === "lava") drawLava(width);
  else if (type === "gorilla") drawGorilla(width);
  else drawSecurity(width);
  if (wrecked) drawStunned(width);
  ctx.restore();
}

function drawSnake(x, y) {
  ctx.save();
  ctx.translate(x - 30, y - 32);
  drawSnakeBody(60);
  ctx.restore();
}

function drawMonkey(x, y) {
  const hop = Math.sin((state.hop / 0.14) * Math.PI) * (reduceMotion ? 0 : 9);
  ellipse(x, y + 20, 19 - hop * 0.3, 7, "#203a3155");
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y - hop));
  ctx.strokeStyle = "#774627";
  ctx.lineWidth = 6;
  ctx.lineCap = "square";
  ctx.beginPath();
  ctx.moveTo(11, 12);
  ctx.lineTo(23, 14);
  ctx.lineTo(27, 7);
  ctx.lineTo(25, 1);
  ctx.lineTo(20, 1);
  ctx.stroke();
  rect(-12, 9, 9, 14, "#704529");
  rect(4, 9, 9, 14, "#704529");
  rect(-12, 0, 25, 18, "#9c6034");
  rect(-6, 1, 13, 16, "#d3a16b");
  rect(-22, -15, 11, 17, "#965b33");
  rect(13, -15, 11, 17, "#965b33");
  rect(-19, -11, 6, 9, "#d99b74");
  rect(15, -11, 6, 9, "#d99b74");
  rect(-15, -23, 30, 28, "#965b33");
  rect(-10, -28, 20, 7, "#965b33");
  rect(-4, -32, 8, 7, "#774627");
  rect(-11, -18, 22, 23, "#e8b783");
  rect(-15, -10, 30, 10, "#e8b783");
  rect(-9, -15, 6, 7, "#26372c");
  rect(4, -15, 6, 7, "#26372c");
  rect(-8, -15, 2, 2, "#fff0c7");
  rect(5, -15, 2, 2, "#fff0c7");
  rect(-2, -6, 5, 3, "#b47b52");
  rect(-5, 0, 11, 2, "#774627");
  rect(-17, 2, 6, 10, "#965b33");
  rect(12, 2, 6, 10, "#965b33");
  ctx.restore();
}

function burst(type, origin) {
  const x = origin?.x ?? state.player.x;
  const y = origin?.y ?? state.player.row * CELL + CELL / 2;
  const bloody = (type === "car" || type === "snake") && blood;
  const colors =
    type === "blast"
      ? ["#ff9b3d", "#f6cd55", "#e2572b", "#fff3c4", "#4a4038"]
      : bloody
        ? ["#a62628", "#bc3433", "#811f28", "#d44a3c"]
        : type === "water"
          ? ["#a2d8cc", "#d4ede0", "#6dbbb6"]
          : ["#f6cd55", "#f7ecb4", "#ffffff"];
  const amount = reduceMotion ? 10 : type === "blast" ? 60 : bloody ? 45 : 24;
  for (let i = 0; i < amount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const velocity = 35 + Math.random() * 190;
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * velocity,
      vy: Math.sin(angle) * velocity,
      life: 0.4 + Math.random() * 0.5,
      maxLife: 1,
      size: 3 + Math.random() * 6,
      color: colors[i % colors.length],
    });
  }
  if (bloody) {
    for (let i = 0; i < 20; i++)
      stains.push({
        x: x + (Math.random() - 0.5) * 86,
        y: y + (Math.random() - 0.5) * 54,
        size: 3 + Math.random() * 13,
        life: 5,
        color: colors[i % colors.length],
      });
  }
  if (!reduceMotion && (type === "car" || type === "blast"))
    shake = type === "blast" ? 0.3 : 0.24;
}

function hazardName(row) {
  const lane = LANE_CONFIG.find((item) => item.row === row);
  return HAZARD_NAMES[hazardType(lane, state.level)] || "PREDATOR";
}

function announce(message) {
  $("announcement").textContent = message;
  $("announcement").classList.add("visible");
  clearTimeout(announcementTimer);
  announcementTimer = setTimeout(
    () => $("announcement").classList.remove("visible"),
    1700,
  );
}

const leaderboardKey = "monkey-crossing-leaderboard";
const initialsKey = "monkey-crossing-initials";
const isLocalPreview =
  ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname) ||
  location.protocol === "file:";

function platformName() {
  const raw = String(
    navigator.userAgentData?.platform || navigator.platform || "WEB",
  ).toUpperCase();
  if (/ANDROID/.test(raw)) return "ANDROID";
  if (/IPHONE|IPAD|IOS/.test(raw)) return "IOS";
  if (/MAC/.test(raw)) return "MAC";
  if (/WIN/.test(raw)) return "WINDOWS";
  if (/LINUX/.test(raw)) return "LINUX";
  return "WEB";
}

function localEntries() {
  try {
    return sortEntries(
      JSON.parse(localStorage.getItem(leaderboardKey) || "[]"),
    );
  } catch {
    return [];
  }
}

function saveLocalEntries(entries) {
  try {
    localStorage.setItem(
      leaderboardKey,
      JSON.stringify(entries.slice(0, LEADERBOARD_LIMIT)),
    );
  } catch {}
}

function leaderboardStatus() {
  if (leaderboardOnline) return "PUBLIC BOARD · SHARED FOR EVERY CROSSER";
  return isLocalPreview
    ? "LOCAL PREVIEW BOARD · SAVED IN THIS BROWSER"
    : "PUBLIC BOARD UNAVAILABLE · SHOWING THIS DEVICE";
}

function renderLeaderboard() {
  const rows = $("leaderboard-rows");
  rows.replaceChildren();
  const entries = sortEntries(leaderboardEntries).slice(0, LEADERBOARD_LIMIT);
  for (let rank = 1; rank <= LEADERBOARD_LIMIT; rank++) {
    const entry = entries[rank - 1];
    const row = document.createElement("tr");
    if (!entry) row.className = "empty";
    else if (entry.id === submittedEntryId) row.className = "you";
    for (const value of [
      entry?.initials ?? "OPEN",
      entry ? String(entry.score).padStart(4, "0") : "----",
      ordinal(rank),
      entry?.platform ?? "—",
    ]) {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    }
    rows.append(row);
  }
}

async function loadLeaderboard() {
  $("leaderboard-status").textContent = "LOADING TOP MONKEYS…";
  try {
    const response = await fetch("/api/leaderboard", { cache: "no-store" });
    if (!response.ok) throw new Error("Leaderboard unavailable");
    const data = await response.json();
    leaderboardEntries = sortEntries(data.entries).slice(0, LEADERBOARD_LIMIT);
    leaderboardOnline = true;
  } catch {
    leaderboardEntries = localEntries();
    leaderboardOnline = false;
  } finally {
    leaderboardReady = true;
    $("leaderboard-status").textContent = leaderboardStatus();
    renderLeaderboard();
    updateScoreEntry();
  }
}

function refreshLeaderboard() {
  leaderboardReady = false;
  updateScoreEntry();
  leaderboardRequest ||= loadLeaderboard().finally(() => {
    leaderboardRequest = null;
  });
  return leaderboardRequest;
}

function updateScoreEntry() {
  const eligible =
    leaderboardReady &&
    pendingScore &&
    !pendingScore.submitted &&
    qualifies(leaderboardEntries, pendingScore.score);
  $("leaderboard-callout").hidden = !eligible;
  $("score-entry").hidden = !eligible;
  if (!eligible) return;
  $("entry-score").textContent = String(pendingScore.score).padStart(4, "0");
  $("entry-platform").textContent = pendingScore.platform;
}

function prepareScoreEntry() {
  pendingScore = {
    id: entryId(),
    score: state.score,
    platform: platformName(),
    submitted: false,
  };
  submittedEntryId = null;
  try {
    $("initials").value =
      normalizeInitials(localStorage.getItem(initialsKey)) || "AAA";
  } catch {
    $("initials").value = "AAA";
  }
  $("entry-message").textContent = "Use exactly 3 letters to claim your rank.";
  refreshLeaderboard();
}

async function submitScore(event) {
  event.preventDefault();
  if (!pendingScore || pendingScore.submitted || pendingScore.submitting)
    return;
  const initials = normalizeInitials($("initials").value);
  $("initials").value = initials;
  if (initials.length !== 3) {
    $("entry-message").textContent = "Enter exactly 3 letters.";
    $("initials").focus();
    return;
  }
  const entry = createEntry({
    id: pendingScore.id,
    initials,
    score: pendingScore.score,
    platform: pendingScore.platform,
  });
  if (!entry) {
    $("entry-message").textContent = "That score could not be verified.";
    return;
  }
  pendingScore.submitting = true;
  const submitButton = $("score-form").querySelector("button");
  submitButton.disabled = true;
  $("entry-message").textContent = "Posting score…";
  try {
    let entries;
    if (leaderboardOnline) {
      const response = await fetch("/api/leaderboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(entry),
      });
      const data = await response.json().catch(() => ({}));
      if (Array.isArray(data.entries)) entries = data.entries;
      if (!response.ok) {
        const failure = new Error(
          response.status === 409
            ? "This run no longer makes the top 10."
            : data.error || "Could not save.",
        );
        failure.entries = entries;
        throw failure;
      }
    } else {
      if (!qualifies(localEntries(), entry.score))
        throw new Error("This run no longer makes the top 10.");
      entries = mergeEntries(localEntries(), entry);
      saveLocalEntries(entries);
    }
    leaderboardEntries = sortEntries(entries).slice(0, LEADERBOARD_LIMIT);
    pendingScore.submitted = true;
    submittedEntryId = entry.id;
    save(initialsKey, initials);
    renderLeaderboard();
    const rank =
      leaderboardEntries.findIndex((item) => item.id === entry.id) + 1;
    $("entry-message").textContent = `${ordinal(rank)} place secured.`;
    toast(`${initials} posted ${entry.score} points on Top Monkey Crossers.`);
  } catch (error) {
    if (Array.isArray(error.entries))
      leaderboardEntries = sortEntries(error.entries).slice(
        0,
        LEADERBOARD_LIMIT,
      );
    if (error instanceof Error && error.message.includes("top 10"))
      $("entry-message").textContent = "This run no longer makes the top 10.";
    else $("entry-message").textContent = "Could not save. Try again.";
    renderLeaderboard();
  } finally {
    pendingScore.submitting = false;
    submitButton.disabled = false;
    updateScoreEntry();
  }
}

function handleEvent(type, data) {
  if (type === "over") {
    showOverlay(
      "END OF THE EXPEDITION",
      "One more<br>monkey business?",
      `You scored ${state.score} points and reached level ${state.level}.<br>The bananas aren’t going to collect themselves.`,
      "Try again",
    );
    prepareScoreEntry();
    return;
  }
  if (type === "coin-spawn") {
    playTone("coin-spawn");
    announce("JUNGLE COINS IN THE WILD!");
    return;
  }
  if (type === "coin") {
    playTone("coin");
    announce("LAUNCHER ARMED — B / DOUBLE-TAP TO FIRE");
    updateHUD();
    return;
  }
  if (type === "blast") {
    playTone("blast");
    burst("blast", data);
    announce("DIRECT HIT! +25");
    updateHUD();
    return;
  }
  playTone(type);
  if (type === "goal")
    announce(
      state.harvest === 0
        ? `LEVEL ${state.level} · ${biomeForLevel(state.level).name}`
        : "BANANA HAUL! + BONUS",
    );
  else {
    burst(type);
    announce(
      type === "car"
        ? `${hazardName(state.player.row)} GOT THE MONKEY!`
        : type === "snake"
          ? "AMBUSHED BY A SNAKE!"
          : type === "water"
            ? "MONKEYS NEED LOGS!"
            : "OUT OF TIME!",
    );
  }
  updateHUD();
}

function updateHUD() {
  if (state.score > best) {
    best = state.score;
    save("monkey-crossing-best", best);
  }
  $("score").textContent = String(state.score).padStart(4, "0");
  $("best").textContent = String(best).padStart(4, "0");
  $("level").textContent = String(state.level).padStart(2, "0");
  $("lives").textContent = Array.from({ length: 3 }, (_, i) =>
    i < state.lives ? "●" : "○",
  ).join(" ");
  $("lives").setAttribute("aria-label", `${state.lives} lives`);
  $("harvest").textContent = `${state.harvest} / ${BANANA_SPOTS.length}`;
  $("shots").textContent = Array.from({ length: MAX_GRENADES }, (_, i) =>
    i < state.launcher ? "●" : "○",
  ).join(" ");
  $("shots").setAttribute("aria-label", `${state.launcher} shots`);
  $("fire").classList.toggle("empty", state.launcher === 0);
  $("fire").setAttribute(
    "aria-label",
    state.launcher
      ? `Fire shot, ${state.launcher} remaining`
      : "Fire shot unavailable, collect a jungle coin",
  );
  const seconds = Math.ceil(state.remaining);
  $("time").textContent = `${seconds}s`;
  $("timer").setAttribute("aria-valuenow", seconds);
  $("timer-fill").style.width = `${(state.remaining / ROUND_TIME) * 100}%`;
  $("timer-fill").style.background = seconds <= 10 ? "#e97a50" : "";
  $("game-status").textContent = {
    ready: "READY WHEN YOU ARE",
    playing:
      state.respawn > 0
        ? "A LITTLE ROUGH OUT THERE"
        : "NEXT STOP: BANANA GROVE",
    paused: "TAKING A BREATHER",
    over: "THERE’S ALWAYS ANOTHER WAY",
  }[state.mode];
  $("pause").disabled = state.mode === "ready" || state.mode === "over";
  $("pause").textContent = state.mode === "paused" ? "▷" : "Ⅱ";
  $("pause").setAttribute(
    "aria-label",
    state.mode === "paused" ? "Resume game" : "Pause game",
  );
  $("blood").setAttribute("aria-pressed", blood);
  $("sound").setAttribute("aria-pressed", sound);
  $("dark").setAttribute("aria-pressed", dark);
  $("bnw").setAttribute("aria-pressed", bnw);
}

function applyTheme() {
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.classList.toggle("bnw", bnw);
  document
    .querySelector('meta[name="theme-color"]')
    .setAttribute("content", dark ? "#0d1713" : "#183f35");
}

function showOverlay(label, title, description, button) {
  $("overlay-label").textContent = label;
  $("overlay-title").innerHTML = title;
  $("overlay-description").innerHTML = description;
  $("start").textContent = `${button} →`;
  $("overlay-hint").textContent = "PRESS ENTER OR TAP THE BUTTON";
  $("leaderboard-callout").hidden = true;
  $("overlay").classList.remove("hidden");
  $("start").focus({ preventScroll: true });
  updateHUD();
}

function startGame() {
  unlockAudio();
  if (state.mode === "paused") state.mode = "playing";
  else {
    state = createState();
    state.mode = "playing";
    particles = [];
    stains = [];
    shake = 0;
    pendingScore = null;
    $("score-entry").hidden = true;
  }
  $("overlay").classList.add("hidden");
  $("announcement").classList.remove("visible");
  canvas.focus({ preventScroll: true });
  playTone("start");
  updateHUD();
}

function pauseGame() {
  if (state.mode === "paused") {
    startGame();
    return;
  }
  if (state.mode !== "playing") return;
  state.mode = "paused";
  showOverlay(
    "TAKE YOUR TIME",
    "Even monkeys<br>need a break.",
    "Your jungle trek can wait.<br>Pick up right where you left off.",
    "Back to the jungle",
  );
}

function move(direction) {
  unlockAudio();
  if (movePlayer(state, direction)) {
    playTone("hop");
    step(state, 0, handleEvent);
    updateHUD();
  }
}

function fire() {
  unlockAudio();
  if (fireGrenade(state)) {
    playTone("launch");
    updateHUD();
  } else if (
    state.mode === "playing" &&
    state.respawn === 0 &&
    !state.grenade &&
    state.launcher === 0
  )
    announce("GRAB A JUNGLE COIN TO LOAD A SHOT");
}

function draw(dt) {
  ctx.save();
  if (shake > 0) {
    ctx.translate(
      (Math.random() - 0.5) * shake * 30,
      (Math.random() - 0.5) * shake * 30,
    );
  }
  drawGround();
  for (const stain of stains) {
    ctx.globalAlpha = Math.min(1, stain.life / 2) * 0.85;
    rect(stain.x, stain.y, stain.size, stain.size * 0.7, stain.color);
  }
  ctx.globalAlpha = 1;
  for (const lane of LANE_CONFIG) {
    for (const object of laneObjects(
      lane,
      state.mode === "ready" ? sceneryTime : state.elapsed,
      state.level,
    )) {
      if (lane.kind === "river")
        drawLog(object.x, lane.row * CELL, object.width);
      else
        drawHazard(
          object.x,
          lane.row * CELL,
          object.width,
          lane.speed,
          hazardType(lane, state.level),
          state.wrecks.some(
            (wreck) => wreck.row === lane.row && wreck.id === object.id,
          ),
          biomeForLevel(state.level).name,
        );
    }
  }
  for (const snake of state.snakes)
    drawSnake(snake.x, snake.row * CELL + CELL / 2);
  for (const coin of state.coins) drawCoin(coin.x, coin.row * CELL + CELL / 2);
  if (state.respawn === 0 && state.mode !== "over")
    drawMonkey(state.player.x, state.player.row * CELL + 32);
  if (state.grenade) drawGrenade(state.grenade.x, state.grenade.y);
  for (const particle of particles) {
    ctx.globalAlpha = Math.min(1, particle.life * 2);
    rect(particle.x, particle.y, particle.size, particle.size, particle.color);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  if (state.mode !== "paused") {
    for (const particle of particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= Math.exp(-dt * 4);
      particle.vy *= Math.exp(-dt * 4);
      particle.life -= dt;
    }
    particles = particles.filter((particle) => particle.life > 0);
    for (const stain of stains) stain.life -= dt;
    stains = stains.filter((stain) => stain.life > 0);
    shake = Math.max(0, shake - dt);
  }
}

function frame(time) {
  const dt = Math.min((time - (lastTime || time)) / 1000, 0.05);
  lastTime = time;
  if (state.mode !== "paused" && (!reduceMotion || state.mode === "playing"))
    sceneryTime += dt;
  let remaining = dt;
  while (remaining > 0) {
    const tick = Math.min(remaining, 1 / 120);
    step(state, tick, handleEvent);
    remaining -= tick;
  }
  draw(dt);
  updateHUD();
  requestAnimationFrame(frame);
}

$("start").addEventListener("click", startGame);
$("pause").addEventListener("click", pauseGame);
$("sound").addEventListener("click", () => {
  sound = !sound;
  unlockAudio();
  playTone("hop");
  updateHUD();
});
$("blood").addEventListener("click", () => {
  blood = !blood;
  save("monkey-crossing-blood", blood);
  if (!blood) {
    stains = [];
    particles = [];
  }
  updateHUD();
});
$("dark").addEventListener("click", () => {
  dark = !dark;
  save("monkey-crossing-dark", dark);
  applyTheme();
  updateHUD();
});
$("bnw").addEventListener("click", () => {
  bnw = !bnw;
  save("monkey-crossing-bnw", bnw);
  applyTheme();
  updateHUD();
});
matchMedia("(prefers-color-scheme: dark)").addEventListener(
  "change",
  (event) => {
    try {
      if (localStorage.getItem("monkey-crossing-dark") !== null) return;
    } catch {}
    dark = event.matches;
    applyTheme();
  },
);
const keys = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
  w: "up",
  s: "down",
  a: "left",
  d: "right",
};
document.addEventListener("keydown", (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (keys[key] && state.mode === "playing") {
    event.preventDefault();
    move(keys[key]);
  } else if (
    (key === "b" || key === " ") &&
    state.mode === "playing" &&
    !event.repeat
  ) {
    event.preventDefault();
    fire();
  } else if ((key === "p" || key === "Escape") && !event.repeat) pauseGame();
  else if (
    key === "Enter" &&
    state.mode !== "playing" &&
    !event.repeat &&
    (event.target === document.body || event.target === canvas)
  ) {
    event.preventDefault();
    startGame();
  }
});
for (const button of document.querySelectorAll("[data-direction]"))
  button.addEventListener("click", () => move(button.dataset.direction));
$("fire").addEventListener("click", fire);
let swipe;
for (const eventName of ["contextmenu", "selectstart", "dragstart"])
  canvas.addEventListener(eventName, (event) => event.preventDefault());
canvas.addEventListener("pointerdown", (event) => {
  swipe = { x: event.clientX, y: event.clientY };
  canvas.setPointerCapture(event.pointerId);
});
let lastTap = 0;
canvas.addEventListener("pointerup", (event) => {
  if (!swipe) return;
  const dx = event.clientX - swipe.x;
  const dy = event.clientY - swipe.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) > 12) {
    move(
      Math.abs(dx) > Math.abs(dy)
        ? dx > 0
          ? "right"
          : "left"
        : dy > 0
          ? "down"
          : "up",
    );
    lastTap = 0;
  } else {
    const now = performance.now();
    if (now - lastTap < 320) {
      lastTap = 0;
      fire();
    } else lastTap = now;
  }
  swipe = null;
});
canvas.addEventListener("pointercancel", () => {
  swipe = null;
});
const touchPlatform = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
document.documentElement.classList.toggle("mobile", touchPlatform);
if (touchPlatform)
  document.addEventListener(
    "touchmove",
    (event) => {
      if (state.mode === "playing") event.preventDefault();
    },
    { passive: false },
  );
document.addEventListener("visibilitychange", () => {
  if (document.hidden && state.mode === "playing") pauseGame();
});
window.addEventListener("blur", () => {
  if (state.mode === "playing") pauseGame();
});

function toast(message) {
  $("toast").textContent = message;
  $("toast").classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("visible"), 4200);
}

$("initials").addEventListener("input", (event) => {
  event.target.value = normalizeInitials(event.target.value);
});
$("score-form").addEventListener("submit", submitScore);
applyTheme();
updateHUD();
refreshLeaderboard();
requestAnimationFrame(frame);
