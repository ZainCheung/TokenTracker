-- Profile likes relation table for the tokentracker-profile-likes edge function.
--
-- Context:
-- - Replaces the old single counter (tokentracker_user_settings.profile_likes +
--   a client-trusted delta) with one row per (target_user_id, liker_id). The
--   like count is COUNT(*) — a self-consistent truth that can't drift,
--   double-count, or roll back on a stale optimistic update; `liked` = whether
--   the caller's own liker_id has a row.
-- - liker_id namespaces (kept distinct so an anonymous caller can never collide
--   with / impersonate an account id):
--     <bare uuid>        signed-in, taken ONLY from a server-verified JWT sub
--     anon_<uuid>        anonymous, a client-persisted random UUID
--     legacy_<uuid>_<n>  migrated historical counters (never revocable)
--     compat_<uuid>      old {user_id, delta} clients (no stable identity)
--
-- Security:
-- - RLS is ENABLED with NO policy, so only the edge function's service-role key
--   can read/write. Direct anon/authenticated PostgREST access is denied. This
--   protects "who liked whom" (liker_id holds real account ids) and stops anyone
--   from inserting rows outside the edge's identity + target-exists checks.
-- - The UNIQUE (target_user_id, liker_id) constraint is LOAD-BEARING: the edge's
--   `like` is made idempotent by catching its duplicate-key violation, so one
--   liker can never be counted twice. Dropping it silently re-enables spam.
-- - Threat model (decorative counter — NOT a trust source): the like count does
--   not affect leaderboard rank (rank is token-based). Anonymous dedup is
--   best-effort only — a caller can mint fresh anon_<uuid> values (or POST the
--   legacy {user_id, delta} protocol, which has no identity at all) to inflate a
--   target's count. This is accepted for a vanity counter; do not treat the
--   count as a verified signal. The legacy delta path exists purely for embedded
--   desktop dashboards that lag on releases and should be retired once they ship
--   the new {target_user_id, action, anon_id} protocol.
--
-- This script is intentionally idempotent. Run with:
--   npx @insforge/cli db query "$(cat scripts/ops/tokentracker-profile-likes-schema.sql)"

CREATE TABLE IF NOT EXISTS public.tokentracker_profile_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id uuid NOT NULL,
  liker_id text NOT NULL,
  is_authenticated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tokentracker_profile_likes_target_user_id_liker_id_key
    UNIQUE (target_user_id, liker_id)
);

CREATE INDEX IF NOT EXISTS idx_ttpl_target
  ON public.tokentracker_profile_likes (target_user_id);

-- Deny all direct PostgREST access; the edge function uses the service role.
ALTER TABLE public.tokentracker_profile_likes ENABLE ROW LEVEL SECURITY;

-- Belt-and-suspenders alongside RLS: never expose direct DML to public roles.
REVOKE ALL PRIVILEGES ON TABLE public.tokentracker_profile_likes
FROM anon, authenticated, PUBLIC;

-- One-time migration of the old per-profile counters into immutable 'legacy_'
-- rows so COUNT(*) preserves historical likes. ON CONFLICT keeps it re-runnable:
-- liker_id is deterministic, so re-running this migration inserts nothing new.
--
-- NOTE on the source column: after this migration the runtime never reads or
-- writes tokentracker_user_settings.profile_likes again — it lives on only as a
-- one-time migration source / historical snapshot, safe to DROP in a later pass.
-- The legacy_ rows are a permanent floor (no client path deletes them); a "reset
-- to zero and regrow" product change would need its own cleanup script.
INSERT INTO public.tokentracker_profile_likes (target_user_id, liker_id)
SELECT user_id, 'legacy_' || user_id || '_' || g
FROM public.tokentracker_user_settings,
     generate_series(1, profile_likes) AS g
WHERE profile_likes > 0
ON CONFLICT (target_user_id, liker_id) DO NOTHING;
