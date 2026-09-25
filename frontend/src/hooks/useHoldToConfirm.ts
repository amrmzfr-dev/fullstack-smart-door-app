import { useCallback, useEffect, useRef, useState } from "react";

// Press-and-hold guard for actions that shouldn't fire on a stray tap
// (remote unlock, deleting a person). `progress` goes 0 → 1 while held;
// letting go early resets it.
export function useHoldToConfirm(durationMs: number, onConfirmed: () => void) {
  const [progress, setProgress] = useState(0);
  const frameRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const onConfirmedRef = useRef(onConfirmed);

  useEffect(() => {
    onConfirmedRef.current = onConfirmed;
  }, [onConfirmed]);

  const stopFrame = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
  }, []);

  const cancel = useCallback(() => {
    stopFrame();
    setProgress(0);
  }, [stopFrame]);

  const start = useCallback(() => {
    stopFrame();
    startedAtRef.current = performance.now();

    const tick = (time: number) => {
      const next = Math.min((time - startedAtRef.current) / durationMs, 1);
      if (next >= 1) {
        frameRef.current = null;
        setProgress(0);
        onConfirmedRef.current();
        return;
      }
      setProgress(next);
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
  }, [durationMs, stopFrame]);

  useEffect(() => stopFrame, [stopFrame]);

  return { progress, holding: progress > 0, start, cancel };
}
