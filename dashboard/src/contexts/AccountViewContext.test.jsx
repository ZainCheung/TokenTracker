import React from "react";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AccountViewProvider, useAccountView } from "./AccountViewContext.jsx";

vi.mock("./InsforgeAuthContext.jsx", () => ({
  useInsforgeAuth: () => ({ enabled: true, signedIn: true, loading: false }),
}));

vi.mock("../lib/cloud-sync-prefs", () => ({
  CLOUD_USAGE_SYNCED_EVENT: "tt.cloudUsageSynced",
  getCloudSyncEnabled: () => true,
  isLocalDashboardHost: () => true,
  syncCloudSyncPrefToLocalServer: vi.fn(),
}));

describe("AccountViewProvider", () => {
  it("bumps account revision after cloud usage sync completes", () => {
    const wrapper = ({ children }) => <AccountViewProvider>{children}</AccountViewProvider>;
    const { result } = renderHook(() => useAccountView(), { wrapper });

    expect(result.current).toMatchObject({ accountView: true, revision: 0 });
    act(() => window.dispatchEvent(new Event("tt.cloudUsageSynced")));
    expect(result.current.revision).toBe(1);
  });
});
