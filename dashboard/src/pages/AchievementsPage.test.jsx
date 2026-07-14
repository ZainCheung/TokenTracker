import { describe, expect, it } from "vitest";
import { cloudBadgesSettled } from "./AchievementsPage.jsx";

describe("cloudBadgesSettled", () => {
  it("keeps the wall hidden while auth is hydrating", () => {
    expect(
      cloudBadgesSettled({
        authLoading: true,
        signedIn: false,
        userId: null,
        state: { status: "signed-out", userId: null },
      }),
    ).toBe(false);
  });

  it("keeps the wall hidden when a signed-in user has not settled", () => {
    expect(
      cloudBadgesSettled({
        authLoading: false,
        signedIn: true,
        userId: "new-user",
        state: { status: "signed-out", userId: null },
      }),
    ).toBe(false);
    expect(
      cloudBadgesSettled({
        authLoading: false,
        signedIn: true,
        userId: "new-user",
        state: { status: "ready", userId: "previous-user" },
      }),
    ).toBe(false);
  });

  it("reveals once the current user's request succeeds or fails", () => {
    for (const status of ["ready", "error"]) {
      expect(
        cloudBadgesSettled({
          authLoading: false,
          signedIn: true,
          userId: "current-user",
          state: { status, userId: "current-user" },
        }),
      ).toBe(true);
    }
  });
});
