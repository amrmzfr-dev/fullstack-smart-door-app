import { useCallback, useState } from "react";

import { applyTheme, getStoredTheme, type Theme } from "@/lib/theme";

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => getStoredTheme());

  const toggleTheme = useCallback(() => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    applyTheme(next);
    setTheme(next);
  }, [theme]);

  return { theme, toggleTheme };
}
