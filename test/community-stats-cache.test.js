const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

test("community stats endpoint reads a precomputed snapshot instead of scanning all usage", () => {
  const source = read("dashboard/edge-patches/tokentracker-community-models.ts");

  assert.match(source, /from\("tokentracker_community_stats"\)/);
  assert.doesNotMatch(source, /leaderboard_usage_grouped/);
  assert.match(source, /max-age=300/);
  assert.match(source, /stale-while-revalidate=86400/);
});

test("community stats refresh aggregates the daily rollup plus a live tail", () => {
  const migration = read("migrations/20260716113500_add-community-stats-refresh.sql");
  const schedule = read("scripts/ops/community-stats-refresh-cron.sql");

  assert.match(migration, /tokentracker_leaderboard_rollup_daily/);
  assert.match(migration, /leaderboard_hourly_dedup\(v_through, v_to\)/);
  assert.doesNotMatch(migration, /BLOCKED_LEADERBOARD_USER_IDS/);
  assert.match(schedule, /tokentracker-community-stats-refresh/);
  assert.match(schedule, /17 \* \* \* \*/);
});

test("community stats cache table is server-only and singleton keyed", () => {
  const migration = read("migrations/20260716110044_add-community-stats-cache.sql");

  assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.tokentracker_community_stats/i);
  assert.match(migration, /id\s+text\s+PRIMARY KEY/i);
  assert.match(migration, /CHECK\s*\(id = 'total'\)/i);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/i);
  assert.match(migration, /REVOKE ALL ON TABLE public\.tokentracker_community_stats FROM anon, authenticated, PUBLIC/i);
});
