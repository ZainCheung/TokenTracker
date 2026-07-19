import { useCallback, useState } from "react";

export const LIMIT_ALERTS_PREF_KEY = "tt.limitAlerts.enabled";

function readEnabled() {
  try { return window.localStorage.getItem(LIMIT_ALERTS_PREF_KEY) === "1"; } catch { return false; }
}

export function useLimitAlertPrefs() {
  const [enabled, setEnabledState] = useState(readEnabled);
  const setEnabled = useCallback(async (next: boolean) => {
    const value = Boolean(next);
    if (value && typeof Notification !== "undefined" && Notification.permission === "default") {
      await Notification.requestPermission().catch(() => "denied");
    }
    try { window.localStorage.setItem(LIMIT_ALERTS_PREF_KEY, value ? "1" : "0"); } catch { /* restricted webview */ }
    setEnabledState(value);
  }, []);
  return { enabled, setEnabled };
}
