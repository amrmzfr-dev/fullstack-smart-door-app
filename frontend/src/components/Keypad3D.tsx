import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { ArrowRight, Delete } from "lucide-react";

import { cn } from "@/lib/utils";

export type PadKey = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "back" | "enter";
export type PadTone = "idle" | "success" | "error";

// Letters like a phone keypad — just for the look.
const LETTERS: Partial<Record<PadKey, string>> = {
  "2": "ABC",
  "3": "DEF",
  "4": "GHI",
  "5": "JKL",
  "6": "MNO",
  "7": "PQRS",
  "8": "TUV",
  "9": "WXYZ",
};

const KEYS: ReadonlyArray<PadKey> = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "back", "0", "enter"];
const DIGITS = new Set(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);

const KEY_FLASH_MS = 120;
const MAX_TILT_DEG = 7;

interface Keypad3DProps {
  screen: ReactNode;
  tone: PadTone;
  disabled?: boolean;
  onKey: (key: PadKey) => void;
}

// The display on top, then the 4x3 keys, leaning back in 3D with each key
// standing off the page. No frame around it.
export function Keypad3D({ screen, tone, disabled = false, onKey }: Keypad3DProps) {
  const padRef = useRef<HTMLDivElement>(null);
  // Keys shown pressed: held by a finger/mouse, or flashed by the keyboard.
  const [down, setDown] = useState<ReadonlySet<PadKey>>(new Set());

  const press = useCallback((key: PadKey, isDown: boolean) => {
    setDown((current) => {
      const next = new Set(current);
      if (isDown) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  const trigger = useCallback(
    (key: PadKey) => {
      if (disabled) return;
      navigator.vibrate?.(8);
      onKey(key);
    },
    [disabled, onKey],
  );

  // Real keyboard works too: digits, Enter, Backspace.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      let key: PadKey | null = null;
      if (DIGITS.has(event.key)) key = event.key as PadKey;
      else if (event.key === "Enter") key = "enter";
      else if (event.key === "Backspace") key = "back";
      if (key === null) return;

      event.preventDefault();
      const pressed = key;
      press(pressed, true);
      window.setTimeout(() => press(pressed, false), KEY_FLASH_MS);
      trigger(pressed);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [press, trigger]);

  // Leans toward the mouse. Touch screens skip this (no hover).
  const onStageMove = (event: PointerEvent<HTMLDivElement>) => {
    const pad = padRef.current;
    if (pad === null || event.pointerType !== "mouse") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    pad.style.setProperty("--tilt-y", `${(x * MAX_TILT_DEG * 2).toFixed(2)}deg`);
    pad.style.setProperty("--tilt-x", `${(-y * MAX_TILT_DEG * 2).toFixed(2)}deg`);
  };

  const onStageLeave = () => {
    padRef.current?.style.setProperty("--tilt-x", "0deg");
    padRef.current?.style.setProperty("--tilt-y", "0deg");
  };

  return (
    <div className="pad-stage w-full max-w-[340px] py-1" onPointerMove={onStageMove} onPointerLeave={onStageLeave}>
      <div ref={padRef} className="pad-3d flex flex-col gap-[var(--gap)]">
        <div data-tone={tone} className="pad-screen rounded-[18px] px-4 py-[clamp(6px,1.4dvh,16px)]">
          {screen}
        </div>

        {/* pb leaves room for the bottom row's raised edge. */}
        <div className="grid grid-cols-3 gap-[clamp(6px,1.3dvh,12px)] pb-2 [transform-style:preserve-3d]">
          {KEYS.map((key) => {
            const isEnter = key === "enter";
            const isBack = key === "back";
            return (
              <button
                key={key}
                type="button"
                disabled={disabled}
                data-down={down.has(key)}
                aria-label={isEnter ? "Enter" : isBack ? "Delete" : key}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  press(key, true);
                }}
                onPointerUp={(event) => {
                  press(key, false);
                  // Sliding off the key before letting go cancels the press.
                  const rect = event.currentTarget.getBoundingClientRect();
                  const inside =
                    event.clientX >= rect.left &&
                    event.clientX <= rect.right &&
                    event.clientY >= rect.top &&
                    event.clientY <= rect.bottom;
                  if (inside) trigger(key);
                }}
                onPointerCancel={() => press(key, false)}
                onContextMenu={(event) => event.preventDefault()}
                className={cn(
                  "key3d flex h-[var(--key-h)] touch-none flex-col items-center justify-center rounded-[16px] select-none",
                  isEnter ? "key3d-primary text-primary-foreground" : "text-card-foreground",
                )}
              >
                {isEnter ? (
                  <ArrowRight className="size-[40%]" strokeWidth={2.5} />
                ) : isBack ? (
                  <Delete className="size-[36%] text-muted-foreground" />
                ) : (
                  <>
                    <span className="text-[calc(var(--key-h)*0.42)] leading-none font-extrabold">{key}</span>
                    <span className="mt-0.5 font-mono text-[calc(var(--key-h)*0.15)] leading-none tracking-[.18em] text-muted-foreground">
                      {LETTERS[key] ?? ""}
                    </span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
