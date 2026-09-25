import { useEffect, useState } from "react";

const GLYPHS = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#$%&*@";
const TICK_MS = 45;

export type ScrambleTone = "idle" | "success" | "error";

function randomGlyphs(count: number): string {
  let out = "";
  for (let i = 0; i < count; i++) out += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
  return out;
}

interface ScrambleTextProps {
  // null = still waiting: every tile keeps flipping. Once set, all tiles
  // show the answer in the same instant (so it lands together with the
  // "Unlocked" label and the vault opening).
  target: string | null;
  tone: ScrambleTone;
  // How many tiles to spin while waiting.
  length?: number;
}

// Code-breaker tiles: a row of raised 3D tiles whose characters flip over and
// over until the answer arrives, then all snap to it at once (e.g. "OPEN").
export function ScrambleText({ target, tone, length = 6 }: ScrambleTextProps) {
  const [scramble, setScramble] = useState(() => randomGlyphs(length));

  // Only flickers while waiting; the answer itself is rendered straight away.
  useEffect(() => {
    if (target !== null) return;
    const timer = window.setInterval(() => setScramble(randomGlyphs(length)), TICK_MS);
    return () => window.clearInterval(timer);
  }, [target, length]);

  const text = target ?? scramble;
  const settled = target !== null;

  return (
    <div aria-live="polite" aria-label={target ?? "Checking"} className="scramble-row flex w-full justify-center gap-1.5">
      {Array.from(text).map((char, index) => (
        <span
          key={index}
          data-tone={settled ? tone : "idle"}
          data-locked={settled}
          className="scramble-tile flex h-16 max-w-12 flex-1 items-center justify-center rounded-[12px] font-mono text-4xl font-extrabold"
        >
          {/* New key per character so every change replays the flip. */}
          <span key={`${index}-${char}`} className="scramble-glyph">
            {char}
          </span>
        </span>
      ))}
    </div>
  );
}
