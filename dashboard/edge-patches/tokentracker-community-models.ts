/**
 * InsForge Edge: public community model-level token breakdown.
 *
 * Reads the singleton snapshot maintained by the database-native hourly
 * refresh_tokentracker_community_stats job.
 * Public endpoint (no auth required) — data is anonymous aggregate stats.
 *
 * Response:
 * {
 *   top_models: [{ name, tokens, share }],
 *   total_tokens: number,
 *   period: "total",
 *   from: string,
 *   to: string,
 *   generated_at: string
 * }
 */
import { createClient } from "npm:@insforge/sdk";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json", ...extraHeaders },
  });
}

export default async function (req: Request): Promise<Response> {
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: cors });
  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);

  const baseUrl = Deno.env.get("INSFORGE_BASE_URL")!;
  const incomingApiKey =
    req.headers.get("apikey") ??
    req.headers.get("Apikey") ??
    req.headers.get("x-api-key") ??
    undefined;
  const anonKey =
    Deno.env.get("INSFORGE_ANON_KEY") ??
    Deno.env.get("ANON_KEY") ??
    incomingApiKey ??
    undefined;
  const serviceRoleKey = Deno.env.get("INSFORGE_SERVICE_ROLE_KEY");
  if (!serviceRoleKey) return json({ error: "server misconfigured" }, 500);

  const client = createClient({
    baseUrl,
    edgeFunctionToken: serviceRoleKey,
    anonKey,
    ...(anonKey ? { headers: { apikey: anonKey } } : {}),
  });

  try {
    const { data, error } = await client.database
      .from("tokentracker_community_stats")
      .select("total_tokens, top_models, from_day, to_day, generated_at")
      .eq("id", "total")
      .limit(1);
    if (error) return json({ error: error.message }, 500);

    const row = Array.isArray(data) ? data[0] : null;
    if (!row) {
      return json(
        { error: "community stats snapshot is not ready" },
        503,
        { "Cache-Control": "no-store", "Retry-After": "30" },
      );
    }

    const cacheHeaders = {
      "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
      "X-Community-Stats-Source": "snapshot",
    };

    return json(
      {
        top_models: Array.isArray(row.top_models) ? row.top_models : [],
        total_tokens: Number(row.total_tokens) || 0,
        period: "total",
        from: row.from_day,
        to: row.to_day,
        generated_at: row.generated_at,
      },
      200,
      cacheHeaders,
    );
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
}
