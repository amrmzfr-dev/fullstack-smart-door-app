import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import type { Theme } from "@/lib/theme";
import { DashboardPage } from "@/pages/DashboardPage";
import { KeypadPage } from "@/pages/KeypadPage";
import { LoginPage } from "@/pages/LoginPage";

// "/" is the public keypad (no login). "/admin" is the management dashboard.
const IS_ADMIN = window.location.pathname.startsWith("/admin");

export function App() {
  const { theme, toggleTheme } = useTheme();

  return IS_ADMIN ? (
    <AdminApp theme={theme} onToggleTheme={toggleTheme} />
  ) : (
    <KeypadPage theme={theme} onToggleTheme={toggleTheme} />
  );
}

function AdminApp({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const { isAuthenticated, username, login, logout } = useAuth();

  if (!isAuthenticated) {
    return <LoginPage onLogin={login} theme={theme} onToggleTheme={onToggleTheme} />;
  }

  return <DashboardPage username={username} onLogout={logout} theme={theme} onToggleTheme={onToggleTheme} />;
}
