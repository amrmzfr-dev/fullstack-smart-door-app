import { useEffect } from "react";

// Runs `task` now, then again `intervalMs` after each run finishes (not on a
// fixed clock, so a slow request never stacks up behind itself). Pauses while
// the tab is hidden and runs straight away when it comes back.
export function usePolling(task: () => Promise<void>, intervalMs: number): void {
  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let timer: number | undefined;

    const run = async () => {
      if (inFlight) return;
      inFlight = true;
      window.clearTimeout(timer);
      try {
        await task();
      } finally {
        inFlight = false;
      }
      if (!cancelled && document.visibilityState === "visible") {
        timer = window.setTimeout(() => void run(), intervalMs);
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void run();
      }
    };

    void run();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [task, intervalMs]);
}
