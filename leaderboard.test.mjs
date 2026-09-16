import test from "node:test";
import assert from "node:assert/strict";
import {
  LEADERBOARD_LIMIT,
  createEntry,
  mergeEntries,
  normalizeInitials,
  normalizePlatform,
  ordinal,
  qualifies,
  sortEntries,
} from "./leaderboard-core.mjs";
import { createLeaderboardHandler } from "./netlify/functions/leaderboard.mjs";

class MemoryStore {
  value = null;
  etag = 0;

  async getWithMetadata() {
    if (this.value === null) return null;
    return {
      data: structuredClone(this.value),
      etag: String(this.etag),
      metadata: {},
    };
  }

  async setJSON(key, value, options = {}) {
    if (options.onlyIfNew && this.value !== null) return { modified: false };
    if (options.onlyIfMatch && options.onlyIfMatch !== String(this.etag))
      return { modified: false };
    this.value = structuredClone(value);
    this.etag++;
    return { modified: true, etag: String(this.etag) };
  }
}

const request = (method, body) =>
  new Request("http://local.test/api/leaderboard", {
    method,
    headers: { "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

test("arcade initials are uppercase letters and exactly three characters", () => {
  assert.equal(normalizeInitials("m-o-n"), "MON");
  assert.equal(normalizeInitials("a1z"), "AZ");
  assert.equal(normalizeInitials("jungle"), "JUN");
  assert.equal(
    createEntry({ initials: "abc", score: 100, platform: "web" }).initials,
    "ABC",
  );
  assert.equal(
    createEntry({ initials: "ab", score: 100, platform: "web" }),
    null,
  );
});

test("platform names are normalized for the public table", () => {
  assert.equal(normalizePlatform("mac os"), "MAC-OS");
  assert.equal(normalizePlatform("windows!"), "WINDOWS");
  assert.equal(normalizePlatform(""), "");
});

test("entries sort by score, keep ties chronological, and cap at ten", () => {
  const entries = [
    createEntry({ initials: "LOW", score: 50, platform: "WEB" }, { now: 3 }),
    createEntry({ initials: "TOP", score: 900, platform: "MAC" }, { now: 2 }),
    createEntry({ initials: "TIE", score: 900, platform: "IOS" }, { now: 1 }),
  ];
  assert.deepEqual(
    sortEntries(entries).map((entry) => entry.initials),
    ["TIE", "TOP", "LOW"],
  );
  const full = Array.from({ length: LEADERBOARD_LIMIT }, (_, index) =>
    createEntry(
      {
        initials: `P${String.fromCharCode(65 + index)}X`,
        score: 1000 - index,
        platform: "WEB",
      },
      { now: index },
    ),
  );
  const merged = mergeEntries(
    full,
    createEntry({ initials: "NEW", score: 995, platform: "WEB" }),
  );
  assert.equal(merged.length, LEADERBOARD_LIMIT);
  assert.equal(merged[6].initials, "NEW");
  assert.equal(merged.at(-1).score, 992);
});

test("only positive scores that beat the tenth place qualify", () => {
  const full = Array.from({ length: LEADERBOARD_LIMIT }, (_, index) =>
    createEntry(
      {
        initials: `P${String.fromCharCode(65 + index)}X`,
        score: 100 - index,
        platform: "WEB",
      },
      { now: index },
    ),
  );
  assert.equal(qualifies(full, 91), false);
  assert.equal(qualifies(full, 92), true);
  assert.equal(qualifies([], 0), false);
  assert.equal(qualifies([], 1), true);
});

test("arcade records use 1st through 10th labels", () => {
  assert.deepEqual(
    Array.from({ length: LEADERBOARD_LIMIT }, (_, index) => ordinal(index + 1)),
    ["1ST", "2ND", "3RD", "4TH", "5TH", "6TH", "7TH", "8TH", "9TH", "10TH"],
  );
});

test("leaderboard function reads and writes public scores", async () => {
  const handler = createLeaderboardHandler(new MemoryStore());
  const empty = await handler(request("GET"));
  assert.equal(empty.status, 200);
  assert.deepEqual(await empty.json(), { entries: [] });

  const posted = await handler(
    request("POST", {
      id: "first-run",
      initials: "ace",
      score: 480,
      platform: "mac",
    }),
  );
  assert.equal(posted.status, 201);
  const postedData = await posted.json();
  assert.equal(postedData.accepted, true);
  assert.equal(postedData.entries[0].initials, "ACE");
  assert.equal(postedData.entries[0].platform, "MAC");

  const loaded = await handler(request("GET"));
  assert.equal((await loaded.json()).entries[0].score, 480);
});

test("leaderboard function validates submissions and rejects non-qualifying scores", async () => {
  const store = new MemoryStore();
  const handler = createLeaderboardHandler(store);
  const invalid = await handler(
    request("POST", { initials: "NO", score: 500, platform: "WEB" }),
  );
  assert.equal(invalid.status, 400);

  for (let index = 0; index < LEADERBOARD_LIMIT; index++)
    await handler(
      request("POST", {
        id: `run-${index}`,
        initials: `P${String.fromCharCode(65 + index)}X`,
        score: 1000 - index,
        platform: "WEB",
      }),
    );
  const rejected = await handler(
    request("POST", {
      id: "too-low",
      initials: "LOW",
      score: 900,
      platform: "WEB",
    }),
  );
  assert.equal(rejected.status, 409);
  const data = await rejected.json();
  assert.equal(data.entries.length, LEADERBOARD_LIMIT);
  assert.equal(data.entries.at(-1).score, 991);
});
