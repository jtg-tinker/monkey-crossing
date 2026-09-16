export const LEADERBOARD_LIMIT = 10;
export const MAX_SCORE = 999999;
const ID_PATTERN = /^[a-zA-Z0-9-]{6,80}$/;
const INITIALS_PATTERN = /^[A-Z]{3}$/;
const PLATFORM_PATTERN = /^[A-Z0-9_-]{2,16}$/;

export function entryId() {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  );
}

export function normalizeInitials(value) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 3);
}

export function normalizePlatform(value) {
  return String(value ?? "WEB")
    .toUpperCase()
    .replace(/\s+/g, "-")
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 16);
}

export function normalizeScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return null;
  return Math.max(0, Math.min(MAX_SCORE, Math.floor(score)));
}

export function createEntry(input, { now = Date.now() } = {}) {
  const initials = normalizeInitials(input?.initials ?? input?.user);
  const score = normalizeScore(input?.score);
  const platform = normalizePlatform(input?.platform);
  if (!INITIALS_PATTERN.test(initials) || score === null) return null;
  if (!PLATFORM_PATTERN.test(platform)) return null;
  const rawId = String(input?.id ?? "");
  const id = ID_PATTERN.test(rawId) ? rawId : entryId();
  return { id, initials, score, platform, createdAt: now };
}

export function normalizeEntry(value) {
  if (!value || typeof value !== "object") return null;
  const initials = String(value.initials ?? value.user ?? "");
  const platform = String(value.platform ?? "");
  const createdAt = Number(value.createdAt);
  if (
    !INITIALS_PATTERN.test(initials) ||
    !PLATFORM_PATTERN.test(platform) ||
    normalizeScore(value.score) === null ||
    !Number.isFinite(createdAt)
  )
    return null;
  return {
    id: ID_PATTERN.test(String(value.id ?? "")) ? value.id : entryId(),
    initials,
    score: normalizeScore(value.score),
    platform,
    createdAt,
  };
}

export const normalizeEntries = (value) =>
  (Array.isArray(value) ? value : [])
    .map(normalizeEntry)
    .filter(Boolean)
    .slice(0, 100);

export function sortEntries(entries) {
  return normalizeEntries(entries).sort(
    (a, b) =>
      b.score - a.score ||
      a.createdAt - b.createdAt ||
      a.initials.localeCompare(b.initials),
  );
}

export function mergeEntries(entries, entry, limit = LEADERBOARD_LIMIT) {
  const normalized = normalizeEntry(entry);
  if (!normalized) return sortEntries(entries).slice(0, limit);
  return sortEntries([
    ...sortEntries(entries).filter((item) => item.id !== normalized.id),
    normalized,
  ]).slice(0, limit);
}

export function qualifies(entries, score, limit = LEADERBOARD_LIMIT) {
  const normalizedScore = normalizeScore(score);
  if (!normalizedScore) return false;
  const sorted = sortEntries(entries).slice(0, limit);
  return (
    sorted.length < limit || normalizedScore > sorted[sorted.length - 1].score
  );
}

export function ordinal(rank) {
  const teen = rank % 100;
  if (teen >= 11 && teen <= 13) return `${rank}TH`;
  return `${rank}${{ 1: "ST", 2: "ND", 3: "RD" }[rank % 10] || "TH"}`;
}
