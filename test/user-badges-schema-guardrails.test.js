// Text-level invariants for scripts/ops/user-badges.sql — the badge storage
// and compute migration. These are load-bearing semantics; if any assertion
// fails, the edit likely broke monotonic tiers, first-achieved timestamps,
// momentum adjacency, or the deny-all security posture.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const SQL_PATH = path.join(__dirname, "..", "scripts", "ops", "user-badges.sql");
const sql = fs.readFileSync(SQL_PATH, "utf8");

const BADGE_IDS = [
  "token_titan",
  "big_day",
  "marathoner",
  "streak",
  "momentum",
  "polyglot",
  "multitool",
  "podium",
  "veteran",
];

test("both tables enable RLS with deny-all grants", () => {
  for (const table of ["tokentracker_badge_catalog", "tokentracker_user_badges"]) {
    assert.match(sql, new RegExp(`ALTER TABLE public\\.${table}\\s+ENABLE ROW LEVEL SECURITY`));
    assert.match(sql, new RegExp(`REVOKE ALL ON public\\.${table}\\s+FROM anon, authenticated, PUBLIC`));
    assert.match(sql, new RegExp(`GRANT ALL ON public\\.${table}\\s+TO project_admin`));
  }
  // No permissive policies may sneak in — zero-policy RLS is the security model.
  assert.doesNotMatch(sql, /CREATE POLICY/i);
});

test("read RPCs are revoked from public and granted to project_admin only", () => {
  assert.match(sql, /REVOKE EXECUTE ON FUNCTION public\.user_badges_compact\(uuid\[\]\) FROM anon, authenticated, PUBLIC/);
  assert.match(sql, /REVOKE EXECUTE ON FUNCTION public\.user_badges_full\(uuid, boolean\) FROM anon, authenticated, PUBLIC/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.user_badges_compact\(uuid\[\]\) TO project_admin/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.user_badges_full\(uuid, boolean\) TO project_admin/);
  assert.match(sql, /REVOKE EXECUTE ON FUNCTION public\.user_badges_refresh\(\) FROM anon, authenticated, PUBLIC/);
});

test("tier upsert is monotonic and timestamps are set-once", () => {
  // Tier only ratchets up.
  assert.match(sql, /tier = GREATEST\(ub\.tier, EXCLUDED\.tier\)/);
  // First-achieved timestamps never overwritten.
  for (const col of ["bronze_at", "silver_at", "gold_at", "diamond_at"]) {
    assert.match(sql, new RegExp(`${col}\\s*=\\s*COALESCE\\(ub\\.${col},\\s*EXCLUDED\\.${col}\\)`));
  }
  // podium (lower_is_better) keeps the best-ever value via LEAST.
  assert.match(sql, /LEAST\(ub\.metric_value, EXCLUDED\.metric_value\)/);
});

test("momentum compares ADJACENT ISO weeks with a prior-week floor", () => {
  // LAG alone returns the previous ACTIVE week (possibly months earlier);
  // the wk - 7 equality is what makes the ratio week-over-week.
  assert.match(sql, /prev_wk = wk - 7/);
  assert.match(sql, /prev_wtok >= 10000000/);
});

test("refresh claims the shared lock and reads the rollup + live tail", () => {
  assert.match(sql, /leaderboard_refresh_try_claim\('badges', 300\)/);
  assert.match(sql, /tokentracker_leaderboard_rollup_daily/);
  assert.match(sql, /leaderboard_hourly_dedup\(v_through, now\(\)\)/);
});

test("catalog seeds exactly the nine cloud badges with 4-tier thresholds", () => {
  for (const id of BADGE_IDS) {
    assert.match(sql, new RegExp(`\\('${id}',`), `missing catalog seed for ${id}`);
  }
  // Spot-check threshold literals (single source of truth lives HERE).
  assert.match(sql, /100000000, 1000000000, 10000000000, 100000000000/); // token_titan
  assert.match(sql, /'podium',\s*8,\s*true,\s*100, 30, 10, 3/); // podium lower_is_better
  assert.match(sql, /'streak',\s*4,\s*false,\s*3, 7, 30, 100/);
});
