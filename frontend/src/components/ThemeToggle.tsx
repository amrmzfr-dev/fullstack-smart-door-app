import { Moon, Sun } from "lucide-react";

import type { Theme } from "@/lib/theme";

// Round header button (same look as the sign-out button next to it).
export const ROUND_BUTTON_CLASS =
  "flex size-[46px] flex-none items-center justify-center rounded-full border border-border bg-card text-foreground transition-colors hover:bg-secondary";

export function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className={ROUND_BUTTON_CLASS}
    >
      {theme === "dark" ? (
        <Sun className="size-[18px]" strokeWidth={1.8} />
      ) : (
        <Moon className="size-[18px]" strokeWidth={1.8} />
      )}
    </button>
  );
}
