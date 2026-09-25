import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

const GLYPHS = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#$%&*@";
const TICK_MS = 70;
// Ticks between each letter locking into place once the answer is known.
const TICKS_PER_LETTER = 3;

export type ScrambleTone = "idle" | "success" | "error";

function randomGlyphs(count: number): string {
  let out = "";
  for (let i = 0; i < count; i++) out += GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
  return out;
}

interface Frame {
  text: string;
  // How many characters from the left have settled on the answer.
  locked: number;
}

interface ScrambleTextProps {
  // null = still waiting: every tile keeps flipping. Once set, the tiles
  // lock in one by one from the left.
  target: string | null;
  tone: ScrambleTone;
  // How many tiles to spin while waiting.
  length?: number;
}

// Code-breaker tiles: a row of raised 3D tiles whose characters flip over and
// over until the answer arrives, then settle letter by letter (e.g. "OPEN").
export function ScrambleText({ target, tone, length = 6 }: ScrambleTextProps) {
  const size = target?.length ?? length;
  const [frame, setFrame] = useState<Frame>(() => ({ text: randomGlyphs(size), locked: 0 }));

  useEffect(() => {
    let tick = 0;
    const timer = window.setInterval(() => {
      tick += 1;
      const locked = target === null ? 0 : Math.min(size, Math.floor(tick / TICKS_PER_LETTER));
      setFrame({ text: (target?.slice(0, locked) ?? "") + randomGlyphs(size - locked), locked });
      if (target !== null && locked >= size) window.clearInterval(timer);
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [target, size]);

  return (
    <div aria-live="polite" aria-label={target ?? "Checking"} className="scramble-row flex w-full justify-center gap-1.5">
      {Array.from(frame.text).map((char, index) => {
        const isLocked = index < frame.locked;
        return (
          <span
            key={index}
            data-tone={isLocked ? tone : "idle"}
            data-locked={isLocked}
            className="scramble-tile flex h-16 max-w-12 flex-1 items-center justify-center rounded-[12px] font-mono text-4xl font-extrabold"
          >
            {/* New key per character so every change replays the flip. */}
            <span key={`${index}-${char}`} className="scramble-glyph">
              {char}
            </span>
          </span>
        );
      })}
    </div>
  );
}
