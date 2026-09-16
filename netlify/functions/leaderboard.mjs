import { getStore } from "@netlify/blobs";
import {
  createEntry,
  mergeEntries,
  qualifies,
  sortEntries,
} from "../../leaderboard-core.mjs";

const STORE_NAME = "top-monkey-crossers";
const KEY = "entries-v1";
const HEADERS = {
  "cache-control": "no-store",
  "content-type": "application/json; charset=utf-8",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

const json = (body, status = 200) =>
  Response.json(body, { status, headers: HEADERS });

async function snapshot(store) {
  const result = await store.getWithMetadata(KEY, {
    consistency: "strong",
    type: "json",
  });
  return {
    entries: sortEntries(result?.data),
    etag: result?.etag ?? null,
  };
}

async function saveEntry(store, entry) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = await snapshot(store);
    if (!qualifies(current.entries, entry.score))
      return { accepted: false, entries: current.entries };
    const next = mergeEntries(current.entries, entry);
    const options = current.etag
      ? { onlyIfMatch: current.etag }
      : { onlyIfNew: true };
    try {
      const result = await store.setJSON(KEY, next, options);
      if (result?.modified) return { accepted: true, entries: next, entry };
    } catch (error) {
      if (attempt === 3) throw error;
    }
  }
  return { accepted: false, entries: (await snapshot(store)).entries };
}

export function createLeaderboardHandler(store) {
  return async (request) => {
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers: HEADERS });
    if (request.method === "GET") {
      const current = await snapshot(store);
      return json({ entries: current.entries });
    }
    if (request.method !== "POST")
      return new Response("Method not allowed", {
        status: 405,
        headers: { ...HEADERS, allow: "GET, POST, OPTIONS" },
      });

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "Leaderboard submissions must use JSON." }, 400);
    }
    const entry = createEntry(body, { now: Date.now() });
    if (!entry)
      return json(
        { error: "Enter exactly three letters, a score, and a platform." },
        400,
      );
    const result = await saveEntry(store, entry);
    return json(result, result.accepted ? 201 : 409);
  };
}

let handler;
export default async (request, context) => {
  handler ||= createLeaderboardHandler(getStore(STORE_NAME));
  return handler(request, context);
};

export const config = { path: "/api/leaderboard" };
