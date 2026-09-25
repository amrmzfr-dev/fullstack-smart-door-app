import { cn } from "@/lib/utils";

export type VaultState = "idle" | "working" | "open" | "error";

// Rods sit inside the square's height (the square is 62% of the lock height).
const BAR_ROWS = ["top-[23%]", "bottom-[23%]"];
const SPOKE_ANGLES = [0, 90, 180, 270];
const DEGREES_PER_DIGIT = 45;

interface VaultLockProps {
  state: VaultState;
  // Digits typed so far — the dial clicks round one notch per digit.
  digits: number;
  // Bumped on every failure so the shake replays.
  shakeKey: number;
}

// A 3D vault gate, as wide as the keypad and leaning back like it: two thick
// posts, two round bars (=) held together by a raised square dial in the middle.
// Idle: the dial turns as digits are typed. Working: it spins. Open: goes
// green, the dial spins away and the bars slide apart into the posts.
// Error: goes red and shakes.
export function VaultLock({ state, digits, shakeKey }: VaultLockProps) {
  return (
    // The shake lives on the wrapper so it doesn't cancel the lock's tilt.
    <div
      key={state === "error" ? `error-${shakeKey}` : "vault"}
      className={cn("vault-stage w-full max-w-[340px]", state === "error" && "animate-pin-shake")}
      aria-hidden
    >
      <div data-state={state} className="vault relative h-[var(--vault-h)] w-full">
        {/* Recessed back plate — lights up green through the gap when open. */}
        <div className="vault-plate absolute inset-y-[8%] right-7 left-7 rounded-[10px]" />

        {/* Each side is one solid piece: its two bars plus its half of the
            square dial, so they always move together. The outer box clips
            them at the outside edge of the posts. */}
        <div className="absolute inset-0 overflow-hidden rounded-[14px]">
          {(["left", "right"] as const).map((side) => (
            <div key={side} className={cn("vault-side absolute inset-0", `vault-side-${side}`)}>
              {BAR_ROWS.map((row) => (
                <div
                  key={row}
                  className={cn(
                    // Rods run from under the post (12px in) to the side of the square
                    // (half of it is 31% of the lock height), tucking 8px under its
                    // edge so the flat end sits flush against it.
                    "vault-bar absolute h-[calc(var(--vault-h)*0.2)] w-[calc(50%-4px-var(--vault-h)*0.31)]",
                    row,
                    // Round at the post end, flat where it meets the square.
                    side === "left" ? "left-3 rounded-l-full" : "right-3 rounded-r-full",
                  )}
                />
              ))}

              {/* The dial is drawn whole on both sides, each cut to its own
                  half, so closed it looks like one square. */}
              <div
                className={cn(
                  "absolute top-1/2 left-1/2 size-[calc(var(--vault-h)*0.62)] -translate-x-1/2 -translate-y-1/2",
                  `vault-knob-${side}`,
                )}
              >
                <div className="vault-knob size-full rounded-[18px]">
                  <div
                    className="vault-knob-face relative size-full rounded-[18px]"
                    style={{ transform: `rotate(${state === "open" ? 0 : digits * DEGREES_PER_DIGIT}deg)` }}
                  >
                    <span className="vault-knob-ring absolute inset-[18%] rounded-[10px]" />
                    {SPOKE_ANGLES.map((angle) => (
                      <span
                        key={angle}
                        className="absolute top-1/2 left-1/2 h-[42%] w-[9%] origin-top -translate-x-1/2"
                        style={{ transform: `rotate(${angle}deg)` }}
                      >
                        <span className="vault-spoke absolute inset-0 rounded-[3px]" />
                        <span className="vault-spoke absolute -bottom-[5%] left-1/2 aspect-square w-[190%] -translate-x-1/2 rounded-[4px]" />
                      </span>
                    ))}
                    <span className="vault-spoke absolute top-1/2 left-1/2 size-[22%] -translate-x-1/2 -translate-y-1/2 rounded-[5px]" />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Posts sit on top, so both pieces slide in behind them. */}
        {["left-0", "right-0"].map((side) => (
          <div key={side} className={cn("vault-post absolute inset-y-0 w-7 rounded-[10px]", side)}>
            <span className="vault-rivet absolute top-3 left-1/2 size-2 -translate-x-1/2 rounded-[2px]" />
            <span className="vault-rivet absolute bottom-3 left-1/2 size-2 -translate-x-1/2 rounded-[2px]" />
          </div>
        ))}
      </div>
    </div>
  );
}
