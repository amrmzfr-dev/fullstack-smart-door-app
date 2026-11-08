import { useCallback, useState } from "react";

import { usePolling } from "@/hooks/usePolling";
import { fetchStats } from "@/lib/door";
import type { Stats } from "@/types";

const STATS_POLL_MS = 15000;

export function useStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStats(await fetchStats());
      setError(null);
    } catch {
      setError("Couldn't load the numbers");
    }
  }, []);

  usePolling(refresh, STATS_POLL_MS);
  return { stats, error, refresh };
}
