import { describe, expect, it } from "vitest";
import {
  TOKEN_FORMAT_MODES,
  formatTokenCount,
  formatTokenTooltip,
  normalizeTokenFormatMode,
} from "./token-format";

describe("token number formatting", () => {
  it("uses compact K/M/B output by default", () => {
    expect(formatTokenCount(12_345)).toBe("12.3K");
    expect(formatTokenCount(12_345_678)).toBe("12.3M");
    expect(formatTokenCount(12_345_678_901)).toBe("12.3B");
  });

  it("returns grouped exact digits in full mode or forced-full locations", () => {
    expect(formatTokenCount(12_345_678, { mode: TOKEN_FORMAT_MODES.FULL })).toBe("12,345,678");
    expect(formatTokenCount(12_345_678, { forceFull: true })).toBe("12,345,678");
  });

  it("keeps compact and exact values together in hover text", () => {
    expect(formatTokenTooltip(12_345_678)).toBe("12.3M · 12,345,678");
    expect(formatTokenTooltip(999)).toBe("999");
  });

  it("normalizes unknown persisted values to compact", () => {
    expect(normalizeTokenFormatMode("other")).toBe(TOKEN_FORMAT_MODES.COMPACT);
  });
});
