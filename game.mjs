import {
  SIZE,
  CELL,
  LANE_CONFIG,
  ROUND_TIME,
  BANANA_SPOTS,
  laneObjects,
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
try {
  best = Number(localStorage.getItem("monkey-crossing-best")) || 0;
  blood = localStorage.getItem("monkey-crossing-blood") !== "false";
  const storedDark = localStorage.getItem("monkey-crossing-dark");
  if (storedDark !== null) dark = storedDark === "true";
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
const palette = ["#f06b24", "#ffc52e", "#176fc1", "#f7e9bb"];

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

function shrub(x, y, scale = 1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  rect(-16, -5, 34, 15, "#307638");
  rect(-11, -14, 24, 25, "#307638");
  rect(-18, -3, 13, 9, "#205d32");
  rect(-7, -17, 13, 12, "#4b9236");
  rect(8, -9, 8, 11, "#4b9236");
  rect(-8, -9, 4, 4, "#8fba43");
  ctx.restore();
}

function drawGround() {
  rect(0, 0, SIZE, SIZE, "#75a53c");
  for (const row of [0, 3, 7, 11]) {
    const y = row * CELL;
    rect(0, y, SIZE, CELL, row === 0 ? "#397e38" : "#75a53c");
    rect(0, y + CELL - 5, SIZE, 5, "#477532");
    for (let i = 0; i < 35; i++) {
      const x = (i * 97 + row * 43) % SIZE;
      const ty = y + 8 + ((i * 17) % 42);
      rect(x, ty, 3, 6, "#a3ca58");
      rect(x + 5, ty + 3, 3, 3, "#a3ca58");
    }
  }
  rect(0, CELL, SIZE, CELL * 2, "#168f9b");
  for (let row = 1; row <= 2; row++) {
    rect(0, row * CELL, SIZE, 4, "#106e7b");
    for (let i = 0; i < 21; i++) {
      const x =
        (((i * 79 + Math.sin(sceneryTime * 0.7 + i) * 13) % SIZE) + SIZE) %
        SIZE;
      const y = row * CELL + 14 + ((i * 19) % 42);
      rect(x, y, 17 + (i % 3) * 5, 3, "#60c8c4");
      rect(x + 9, y + 5, 8, 2, "#39b2b4");
    }
  }
  for (const start of [4, 8]) {
    rect(0, start * CELL, SIZE, CELL * 3, "#20282e");
    rect(0, start * CELL, SIZE, 5, "#c9c5a0");
    rect(0, (start + 3) * CELL - 5, SIZE, 5, "#c9c5a0");
    for (let line = 1; line < 3; line++)
      for (let x = 15; x < SIZE; x += 70)
        rect(x, (start + line) * CELL - 2, 32, 3, "#b5bba7");
    for (let i = 0; i < 18; i++)
      rect(
        (i * 139) % SIZE,
        start * CELL + 13 + ((i * 31) % 165),
        3,
        3,
        "#2b353c",
      );
  }
  for (const row of [3, 7, 11]) {
    shrub(17, row * CELL + 32, 1.2);
    shrub(SIZE - 17, row * CELL + 35, 1.1);
    if (row !== 11) {
      shrub(115, row * CELL + 19, 0.55);
      shrub(647, row * CELL + 19, 0.55);
    }
  }
  for (const [index, x] of BANANA_SPOTS.entries()) {
    rect(x - 31, 7, 64, 49, "#3c6541");
    rect(x - 27, 7, 56, 4, "#9caf64");
    if (!state.collectedBananas[index]) banana(x - 2, 26, 1.1);
  }
  shrub(31, 27, 1.4);
  shrub(736, 29, 1.4);
  text("BANANA GROVE", SIZE / 2, 60, 8, "#d2ddb0", "center");
  text(
    "↑  THE ONLY WAY IS UP  ↑",
    SIZE / 2,
    SIZE - 10,
    10,
    "#d4dfb2",
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

function drawCar(x, y, width, direction, color, wrecked) {
  ctx.save();
  if (direction < 0) {
    ctx.translate(x + width, y);
    ctx.scale(-1, 1);
  } else ctx.translate(x, y);
  rect(2, 17, width, 42, "#20332c55");
  for (const wheel of [12, width - 25]) {
    rect(wheel, 9, 16, 9, "#252e2d");
    rect(wheel, 47, 16, 9, "#252e2d");
  }
  rect(0, 20, width, 25, "#c2bfa3");
  rect(4, 14, width - 8, 37, color);
  rect(8, 14, width - 20, 4, "#ffffff38");
  rect(8, 47, width - 15, 4, "#00000022");
  const cabin = width > 100 ? width - 39 : 28;
  if (width > 100) {
    rect(9, 18, width - 48, 27, "#e5dfc9");
    rect(12, 20, width - 54, 4, "#fbf3d9");
    for (let i = 18; i < width - 48; i += 12) rect(i, 24, 2, 18, "#c3c4b1");
  } else {
    rect(18, 20, 13, 25, "#243e42");
    rect(21, 21, 3, 23, "#496669");
  }
  rect(cabin, 18, 21, 29, "#ffffff20");
  rect(cabin + 16, 20, 9, 25, "#26484c");
  rect(cabin + 17, 21, 3, 22, "#6b9492");
  rect(width - 7, 17, 5, 8, "#ffecac");
  rect(width - 7, 40, 5, 8, "#ffecac");
  rect(3, 18, 4, 7, "#ae4b3d");
  rect(3, 41, 4, 7, "#ae4b3d");
  if (wrecked) {
    rect(4, 14, width - 8, 37, "#262b2e");
    rect(9, 19, width - 26, 25, "#161b1d");
    rect(14, 14, width - 30, 4, "#3a4245");
    const flicker = Math.sin(sceneryTime * 22 + x) > 0;
    rect(width * 0.3, 8, 12, 9, flicker ? "#ff9b3d" : "#d0542c");
    rect(width * 0.55, 10, 9, 7, flicker ? "#f6cd55" : "#ff9b3d");
    rect(width * 0.44, 3, 6, 6, "#3d4448");
  }
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
  const bloody = type === "car" && blood;
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
      "END OF THE ROAD",
      "One more<br>monkey business?",
      `You scored ${state.score} points and reached level ${state.level}.<br>The bananas aren’t going to collect themselves.`,
      "Try again",
    );
    prepareScoreEntry();
    return;
  }
  if (type === "coin-spawn") {
    playTone("coin-spawn");
    announce("GOLD COINS IN THE LANES!");
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
        ? `LEVEL ${state.level} · PICKING UP SPEED`
        : "BANANA HAUL! + BONUS",
    );
  else {
    burst(type);
    announce(
      type === "car"
        ? "OUCH. LOOK BOTH WAYS!"
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
      : "Fire shot unavailable, collect a road coin",
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
}

function applyTheme() {
  document.documentElement.classList.toggle("dark", dark);
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
    "Your commute can wait.<br>Pick up right where you left off.",
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
    announce("GRAB A ROAD COIN TO LOAD A SHOT");
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
        drawCar(
          object.x,
          lane.row * CELL,
          object.width,
          lane.speed,
          palette[(lane.row + Math.floor(object.width)) % palette.length],
          state.wrecks.some(
            (wreck) => wreck.row === lane.row && wreck.id === object.id,
          ),
        );
    }
  }
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
