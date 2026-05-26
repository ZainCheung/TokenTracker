import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { copy } from "../../lib/copy";
import { formatCompactNumber, formatUsdCurrency } from "../../lib/format";
import { useCurrency } from "../../hooks/useCurrency.js";
import { getLeaderboardProfile } from "../../lib/api";
import { resolveAuthAccessTokenWithRetry } from "../../lib/auth-token";
import { buildActivityHeatmap } from "../../lib/activity-heatmap";
import { LeaderboardAvatar } from "../LeaderboardAvatar.jsx";
import { ProviderIcon } from "../../ui/dashboard/components/ProviderIcon.jsx";
import { ActivityHeatmap } from "../../ui/dashboard/components/ActivityHeatmap.jsx";
import { cn } from "../../lib/cn";

function formatCost(value, currency, rate) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n > 0 && n < 0.01) {
    const symbol = currency === "USD" ? "$" : "";
    return `<${symbol}0.01`;
  }
  return formatUsdCurrency(n, { decimals: 2, currency, rate });
}

/**
 * Compact cost for the stat strip: stays exact under $1000 (so "$94.83" reads
 * naturally), then collapses to K/M/B so a million-dollar total doesn't blow
 * out the 4-column grid alongside a 3-character token count like "56.4B".
 */
function formatCostCompact(value, currency, rate) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1000) return formatCost(n, currency, rate);
  const converted = currency === "USD" ? n : n * (rate || 1);
  const symbol = currency === "USD" ? "$" : "";
  return `${symbol}${formatCompactNumber(converted, { decimals: 1 })}`;
}

function formatTokens(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "0";
  return formatCompactNumber(n, { decimals: 1 });
}

/**
 * Adapt the edge function's daily series ({date, total_tokens}[]) into the
 * shape consumed by the dashboard heatmap and trend components. Heatmap
 * goes through `buildActivityHeatmap` (same path the main dashboard uses);
 * TrendMonitor consumes the rows directly via `day` + `total_tokens`.
 */
function buildHeatmapForModal(daily) {
  const arr = Array.isArray(daily) ? daily : [];
  if (arr.length === 0) return null;
  // Forward `models` so the heatmap's hover tooltip can render the per-day
  // model breakdown (same as the main dashboard heatmap).
  const dailyRows = arr.map((d) => ({
    day: d.date,
    total_tokens: d.total_tokens,
    models: d.models || null,
  }));
  const lastDate = arr[arr.length - 1]?.date;
  return buildActivityHeatmap({ dailyRows, weeks: 52, to: lastDate });
}

/**
 * Skeleton that mirrors the real profile layout (header → stat strip →
 * fact list → heatmap → provider list). Same heights as the loaded view
 * to avoid layout shift on resolve.
 */
function ProfileSkeleton() {
  const bar = "rounded bg-oai-gray-200/70 dark:bg-oai-gray-800/60";
  return (
    <div className="animate-pulse">
      <div className="flex items-start gap-4 px-6 pt-6 pb-5 border-b border-oai-gray-200/80 dark:border-oai-gray-800/60">
        <div className="h-14 w-14 rounded-full bg-oai-gray-200/70 dark:bg-oai-gray-800/60 shrink-0" />
        <div className="flex-1 min-w-0 space-y-2 pt-1">
          <div className={cn(bar, "h-4 w-40")} />
          <div className={cn(bar, "h-3 w-56")} />
        </div>
        <div className={cn(bar, "h-4 w-4 shrink-0 mt-1")} />
      </div>
      <div className="px-6 py-5 space-y-6">
        <div className="grid grid-cols-4 gap-x-6 gap-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i}>
              <div className={cn(bar, "h-6 w-20")} />
              <div className={cn(bar, "mt-2 h-3 w-14")} />
            </div>
          ))}
        </div>
        <div className="space-y-3 border-t border-oai-gray-200/70 dark:border-oai-gray-800/60 pt-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className={cn(bar, "h-3 w-24")} />
              <div className={cn(bar, "h-3 w-44")} />
            </div>
          ))}
        </div>
        <div className="border-t border-oai-gray-200/70 dark:border-oai-gray-800/60 pt-5">
          <div className={cn(bar, "h-3 w-44 mb-4")} />
          <div className="grid grid-cols-[repeat(52,1fr)] gap-[2px]">
            {Array.from({ length: 7 * 52 }).map((_, i) => (
              <div key={i} className="aspect-square rounded-[2px] bg-oai-gray-200/60 dark:bg-oai-gray-800/50" />
            ))}
          </div>
        </div>
        <div className="border-t border-oai-gray-200/70 dark:border-oai-gray-800/60 pt-5">
          <div className={cn(bar, "h-3 w-28 mb-3")} />
          <div className="space-y-2.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className={cn(bar, "h-4 w-4")} />
                <div className={cn(bar, "h-3 w-16")} />
                <div className={cn(bar, "h-[3px] flex-1")} />
                <div className={cn(bar, "h-3 w-12")} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function extractGithubHandle(url) {
  if (!url) return null;
  const m = String(url).match(/github\.com\/([A-Za-z0-9][A-Za-z0-9-]{0,38})/i);
  return m ? m[1] : null;
}

function SectionLabel({ children }) {
  return (
    <h3 className="text-[11px] uppercase tracking-[0.08em] text-oai-gray-500 dark:text-oai-gray-400 mb-3">
      {children}
    </h3>
  );
}

/** Stat number stacked over caption label. */
function Stat({ value, label }) {
  return (
    <div>
      <div className="text-2xl font-semibold tabular-nums tracking-tight leading-none text-oai-black dark:text-white">
        {value}
      </div>
      <div className="mt-1.5 text-[11px] text-oai-gray-500 dark:text-oai-gray-400">{label}</div>
    </div>
  );
}

/** Label/value row used in the inline fact list (streak, best day, top model). */
function FactRow({ label, children }) {
  return (
    <div className="flex items-baseline gap-3 text-sm">
      <dt className="shrink-0 w-28 whitespace-nowrap text-oai-gray-500 dark:text-oai-gray-400">{label}</dt>
      <dd className="min-w-0 flex-1 text-oai-gray-900 dark:text-oai-gray-100 tabular-nums truncate">
        {children}
      </dd>
    </div>
  );
}

function Header({ user, onClose }) {
  const handle = extractGithubHandle(user?.github_url);
  return (
    <div className="flex items-start gap-4 px-6 pt-6 pb-5 border-b border-oai-gray-200/80 dark:border-oai-gray-800/60">
      <LeaderboardAvatar
        avatarUrl={user?.avatar_url}
        displayName={user?.display_name || ""}
        seed={user?.user_id || user?.display_name}
        size="lg"
        className="shrink-0 ring-1 ring-oai-gray-200 dark:ring-oai-gray-800"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h2 className="truncate text-base font-semibold text-oai-black dark:text-white">
            {user?.display_name || "—"}
          </h2>
          {user?.rank ? (
            <span className="shrink-0 text-xs font-medium tabular-nums text-oai-gray-500 dark:text-oai-gray-400">
              {copy("leaderboard.profile_modal.rank", { rank: user.rank })}
            </span>
          ) : null}
        </div>
        {handle && (
          <a
            href={user.github_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-1 text-[12px] text-oai-gray-500 dark:text-oai-gray-400 hover:text-oai-gray-800 dark:hover:text-oai-gray-200 transition-colors"
          >
            <ProviderIcon provider="GITHUB" size={11} />
            <span>@{handle}</span>
          </a>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="shrink-0 -mr-1 -mt-1 flex h-8 w-8 items-center justify-center rounded-md text-oai-gray-500 dark:text-oai-gray-400 hover:text-oai-gray-900 dark:hover:text-white hover:bg-oai-gray-100 dark:hover:bg-oai-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-oai-brand/50 transition-colors"
        aria-label={copy("leaderboard.profile_modal.close")}
      >
        <X size={16} strokeWidth={2} aria-hidden />
      </button>
    </div>
  );
}

function ProviderList({ data }) {
  const arr = Array.isArray(data) ? data : [];
  if (arr.length === 0) {
    return (
      <p className="text-xs text-oai-gray-500 dark:text-oai-gray-400">
        {copy("leaderboard.profile_modal.providers.none")}
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {arr.map((p) => {
        const pct = Math.max(0, Math.min(1, Number(p?.percent) || 0));
        return (
          <li key={p.source} className="flex items-center gap-3 text-xs">
            <span className="shrink-0 inline-flex items-center justify-center w-4 h-4">
              <ProviderIcon provider={String(p.source).toUpperCase()} size={14} />
            </span>
            <span className="shrink-0 capitalize w-16 text-oai-gray-700 dark:text-oai-gray-300">
              {p.source}
            </span>
            <span className="flex-1 h-[3px] rounded-full bg-oai-gray-200/60 dark:bg-oai-gray-800/80 overflow-hidden">
              <span
                className="block h-full bg-oai-brand-500 dark:bg-oai-brand-400"
                style={{ width: `${(pct * 100).toFixed(1)}%` }}
              />
            </span>
            <span className="shrink-0 w-14 text-right tabular-nums text-oai-gray-700 dark:text-oai-gray-300">
              {formatTokens(p.total_tokens)}
            </span>
            <span className="shrink-0 w-10 text-right tabular-nums text-oai-gray-500 dark:text-oai-gray-400">
              {(pct * 100).toFixed(0)}%
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function ModalBody({ data, currency, rate, onClose }) {
  const {
    user,
    totals,
    streak,
    best_day: bestDay,
    models,
    by_provider: byProvider,
    heatmap,
    period,
  } = data;
  const heatmapData = useMemo(() => buildHeatmapForModal(heatmap), [heatmap]);
  const favoriteName = models?.favorite?.model_name;
  const modelCount = Number(models?.count) || 0;

  return (
    <>
      <Header user={user} onClose={onClose} />
      <div className="flex-1 min-h-0 overflow-y-auto oai-scrollbar px-6 py-5 space-y-6">
        {/* Stat strip — flat row, no nested cards */}
        <div className="grid grid-cols-4 gap-x-6 gap-y-4">
          <Stat
            value={formatTokens(totals?.total_tokens)}
            label={copy("leaderboard.profile_modal.stat.total_tokens")}
          />
          <Stat
            value={formatCostCompact(totals?.estimated_cost_usd, currency, rate)}
            label={copy("leaderboard.profile_modal.stat.total_cost")}
          />
          <Stat
            value={String(totals?.active_days ?? 0)}
            label={copy("leaderboard.profile_modal.stat.active_days")}
          />
          <Stat
            value={formatCostCompact(totals?.avg_per_day_usd, currency, rate)}
            label={copy("leaderboard.profile_modal.stat.avg_per_day")}
          />
        </div>

        {/* Fact list — streak, best day, top model. Three lines, no card. */}
        <dl className="space-y-2 border-t border-oai-gray-200/70 dark:border-oai-gray-800/60 pt-5">
          <FactRow label={copy("leaderboard.profile_modal.streak.current")}>
            <span>
              {copy("leaderboard.profile_modal.streak.days", { count: streak?.current_days ?? 0 })}
            </span>
            <span className="ml-2 text-oai-gray-500 dark:text-oai-gray-400">
              (max {streak?.longest_days ?? 0})
            </span>
          </FactRow>
          <FactRow label={copy("leaderboard.profile_modal.best_day.title")}>
            {bestDay ? (
              <>
                <span>{bestDay.date}</span>
                <span className="ml-2 text-oai-gray-500 dark:text-oai-gray-400">
                  {formatTokens(bestDay.total_tokens)}
                </span>
              </>
            ) : (
              <span className="text-oai-gray-500 dark:text-oai-gray-400">
                {copy("leaderboard.profile_modal.best_day.none")}
              </span>
            )}
          </FactRow>
          <FactRow label={copy("leaderboard.profile_modal.models.favorite")}>
            {favoriteName ? (
              <>
                <span className="truncate">{favoriteName}</span>
                {modelCount > 1 && (
                  <span className="ml-2 text-oai-gray-500 dark:text-oai-gray-400">
                    {copy("leaderboard.profile_modal.models.count", { count: modelCount })}
                  </span>
                )}
              </>
            ) : (
              <span className="text-oai-gray-500 dark:text-oai-gray-400">
                {copy("leaderboard.profile_modal.models.none")}
              </span>
            )}
          </FactRow>
        </dl>

        {heatmapData && (
          <section className="border-t border-oai-gray-200/70 dark:border-oai-gray-800/60 pt-5">
            <SectionLabel>{copy("leaderboard.profile_modal.heatmap.title")}</SectionLabel>
            <div className="overflow-x-auto oai-scrollbar -mx-1 px-1">
              <ActivityHeatmap heatmap={heatmapData} hideLegend embedded />
            </div>
          </section>
        )}

        <section className="border-t border-oai-gray-200/70 dark:border-oai-gray-800/60 pt-5">
          <SectionLabel>{copy("leaderboard.profile_modal.providers.title")}</SectionLabel>
          <ProviderList data={byProvider} />
        </section>
      </div>

    </>
  );
}

/**
 * Modal that opens when a leaderboard row is clicked. Fetches the detailed
 * per-user profile from the edge function and renders hero/stats/streak/
 * heatmap/trend/provider sections. See
 * `dashboard/edge-patches/tokentracker-leaderboard-profile.ts` for the
 * canonical response shape.
 */
export function LeaderboardProfileModal({ isOpen, onClose, userId, period, accessToken }) {
  const { currency, rate } = useCurrency();
  const [state, setState] = useState({ loading: false, error: null, data: null });

  useEffect(() => {
    if (!isOpen || !userId) return undefined;
    let active = true;
    setState({ loading: true, error: null, data: null });
    (async () => {
      try {
        const token = accessToken ? await resolveAuthAccessTokenWithRetry(accessToken) : null;
        if (!active) return;
        const data = await getLeaderboardProfile({ accessToken: token, userId, period: period || "week" });
        if (!active) return;
        setState({ loading: false, error: null, data });
      } catch (err) {
        if (!active) return;
        if (err?.status === 404) {
          setState({ loading: false, error: null, data: null });
        } else {
          setState({ loading: false, error: err?.message || String(err), data: null });
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [isOpen, userId, period, accessToken]);

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose?.();
      }}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="cost-modal-backdrop" />
        <Dialog.Viewport className="fixed inset-0 z-[101] flex items-center justify-center p-4">
          <Dialog.Popup
            className={cn(
              "cost-modal-popup",
              "relative w-full max-w-[540px] max-h-[calc(100vh-2rem)] flex flex-col",
              "rounded-2xl bg-white dark:bg-oai-gray-950",
              "shadow-[0_20px_60px_-20px_rgba(0,0,0,0.25)] dark:shadow-[0_20px_60px_-10px_rgba(0,0,0,0.65)]",
              "ring-1 ring-oai-gray-200 dark:ring-oai-gray-800 overflow-hidden",
            )}
          >
            <Dialog.Title render={<h2 className="sr-only" />}>
              {state.data?.user?.display_name || copy("leaderboard.profile_modal.loading")}
            </Dialog.Title>

            {state.loading && <ProfileSkeleton />}
            {!state.loading && state.error && (
              <div className="flex-1 flex items-center justify-center min-h-[280px]">
                <p className="text-sm text-red-500 dark:text-red-400">
                  {copy("leaderboard.profile_modal.error")}
                </p>
              </div>
            )}
            {!state.loading && !state.error && !state.data && (
              <div className="flex-1 flex items-center justify-center min-h-[280px]">
                <p className="text-sm text-oai-gray-500 dark:text-oai-gray-400">
                  {copy("leaderboard.profile_modal.empty")}
                </p>
              </div>
            )}
            {!state.loading && !state.error && state.data && (
              <ModalBody data={state.data} currency={currency} rate={rate} onClose={onClose} />
            )}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
