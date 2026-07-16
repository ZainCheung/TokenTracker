import { describe, expect, it } from "vitest";
import { buildFleetData } from "./model-breakdown";

describe("buildFleetData", () => {
  it("keeps two decimal places for small provider percentages", () => {
    const fleet = buildFleetData({
      sources: [
        {
          source: "claude",
          totals: { billable_total_tokens: 999_600 },
          models: [{ model_id: "claude-sonnet", totals: { billable_total_tokens: 999_600 } }],
        },
        {
          source: "antigravity",
          totals: { billable_total_tokens: 400 },
          models: [{ model_id: "gemini-pro", totals: { billable_total_tokens: 400 } }],
        },
        {
          source: "grok",
          totals: { billable_total_tokens: 1 },
          models: [{ model_id: "grok-code", totals: { billable_total_tokens: 1 } }],
        },
      ],
    });

    expect(fleet.map(({ source, totalPercent }) => [source, totalPercent])).toEqual([
      ["claude", "99.96"],
      ["antigravity", "0.04"],
      ["grok", "0.00"],
    ]);
    expect(fleet[2].totalPercentValue).toBeGreaterThan(0);
    expect(fleet[2].totalPercentValue).toBeLessThan(0.01);
  });
});
