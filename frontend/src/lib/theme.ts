export type Theme = "light" | "dark";

const THEME_KEY = "smart-door-theme";

// Dark by default, like the Gate Sensor app.
export function getStoredTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0c0c0c" : "#f4f1e8");
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Private mode etc. — theme just won't be remembered.
  }
}
