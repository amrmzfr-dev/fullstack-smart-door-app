import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Theme } from "@/lib/theme";

export function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  return (
    <Button
      variant="outline"
      size="icon"
      onClick={onToggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {theme === "dark" ? <Sun /> : <Moon />}
    </Button>
  );
}
