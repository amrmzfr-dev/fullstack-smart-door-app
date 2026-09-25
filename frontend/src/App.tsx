import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import type { Theme } from "@/lib/theme";
import { DashboardPage } from "@/pages/DashboardPage";
import { KeypadPage } from "@/pages/KeypadPage";
import { LoginPage } from "@/pages/LoginPage";
import { PhoneSetupPage } from "@/pages/PhoneSetupPage";

// "/"              public keypad (no login)
// "/admin"         management dashboard
// "/setup/<token>" one-time phone fingerprint setup, opened on the person's phone
const PATH = window.location.pathname;
const IS_ADMIN = PATH.startsWith("/admin");
const SETUP_TOKEN = PATH.startsWith("/setup/") ? decodeURIComponent(PATH.slice("/setup/".length)) : null;

export function App() {
  const { theme, toggleTheme } = useTheme();

  if (SETUP_TOKEN) {
    return <PhoneSetupPage token={SETUP_TOKEN} theme={theme} onToggleTheme={toggleTheme} />;
  }

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
