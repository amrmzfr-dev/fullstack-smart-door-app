import { cn } from "@/lib/utils";

export type KeypadKey = "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "*" | "0" | "#";

interface KeyDef {
  key: KeypadKey;
  hint?: string;
}

// Same 4x3 layout and meaning as the physical keypad on the door:
// digits type, * clears, # enters (see handleKeypad in the firmware).
const ROWS: ReadonlyArray<ReadonlyArray<KeyDef>> = [
  [{ key: "1" }, { key: "2" }, { key: "3" }],
  [{ key: "4" }, { key: "5" }, { key: "6" }],
  [{ key: "7" }, { key: "8" }, { key: "9" }],
  [{ key: "*", hint: "Clear" }, { key: "0" }, { key: "#", hint: "Enter" }],
];

interface KeypadProps {
  onKey: (key: KeypadKey) => void;
  disabled?: boolean;
}

export function Keypad({ onKey, disabled }: KeypadProps) {
  return (
    <div className="grid grid-cols-3 gap-2.5">
      {ROWS.flat().map(({ key, hint }) => {
        const isEnter = key === "#";
        const isClear = key === "*";
        return (
          <button
            key={key}
            type="button"
            disabled={disabled}
            onClick={() => onKey(key)}
            aria-label={hint ? `${key} (${hint})` : key}
            className={cn(
              // Raised key: a hard 3px bottom edge that the key sinks into
              // when pressed, like the Gate Sensor press cards.
              "flex h-16 flex-col items-center justify-center rounded-[16px] border select-none",
              "transition-[transform,box-shadow] duration-75 active:translate-y-[3px] active:shadow-none",
              "disabled:pointer-events-none disabled:opacity-50",
              isEnter
                ? "border-transparent bg-primary text-primary-foreground shadow-[0_3px_0_color-mix(in_oklch,var(--primary),black_35%)]"
                : "border-border bg-card text-card-foreground shadow-[0_3px_0_var(--border)] hover:bg-muted",
            )}
          >
            <span className={cn("leading-none font-extrabold", isClear || isEnter ? "text-2xl" : "text-[26px]")}>
              {key}
            </span>
            {hint && (
              <span
                className={cn(
                  "mt-1 font-mono text-[9px] tracking-[.14em] uppercase",
                  isEnter ? "opacity-70" : "text-muted-foreground",
                )}
              >
                {hint}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

interface PinDisplayProps {
  length: number;
  maxLength: number;
  minLength: number;
  error: boolean;
  shakeKey: number;
}

// One cell per possible digit. Cells past the minimum length are dashed to
// show they're optional. Digits are never shown, only dots.
export function PinDisplay({ length, maxLength, minLength, error, shakeKey }: PinDisplayProps) {
  return (
    <div key={shakeKey} className={cn("flex justify-center gap-2", shakeKey > 0 && "animate-pin-shake")}>
      {Array.from({ length: maxLength }, (_, index) => {
        const filled = index < length;
        const optional = index >= minLength;
        return (
          <div
            key={index}
            className={cn(
              "flex size-10 items-center justify-center rounded-[11px] border-2 transition-colors",
              optional && !filled ? "border-dashed" : "border-solid",
              error ? "border-destructive" : filled ? "border-primary" : "border-border",
            )}
          >
            {filled && <span className={cn("size-3 rounded-full", error ? "bg-destructive" : "bg-foreground")} />}
          </div>
        );
      })}
    </div>
  );
}
