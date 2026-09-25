import { useEffect, useState } from "react";

// Current time that re-renders every `intervalMs` — for "last seen 2 min ago"
// style labels, without calling Date.now() during render.
export function useNow(intervalMs = 5000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);

  return now;
}
