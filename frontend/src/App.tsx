import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import type { Theme } from "@/lib/theme";
import { AccountPage } from "@/pages/AccountPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { KeypadPage } from "@/pages/KeypadPage";
import { LoginPage } from "@/pages/LoginPage";
import { PhoneSetupPage } from "@/pages/PhoneSetupPage";
import { UnlockPage } from "@/pages/UnlockPage";

// "/"              simple page: sign in, door status, Unlock button
// "/keypad"        the old public PIN keypad (no login)
// "/admin"         management dashboard
// "/account"       a person's own sign-in: see their doors and unlock them
// "/setup/<token>" one-time phone fingerprint setup, opened on the person's phone
const PATH = window.location.pathname;
const IS_ADMIN = PATH.startsWith("/admin");
const IS_ACCOUNT = PATH.startsWith("/account");
const IS_KEYPAD = PATH.startsWith("/keypad");
const SETUP_TOKEN = PATH.startsWith("/setup/") ? decodeURIComponent(PATH.slice("/setup/".length)) : null;

export function App() {
  const { theme, toggleTheme } = useTheme();

  if (SETUP_TOKEN) {
    return <PhoneSetupPage token={SETUP_TOKEN} theme={theme} onToggleTheme={toggleTheme} />;
  }

  if (IS_ACCOUNT) {
    return <AccountPage theme={theme} onToggleTheme={toggleTheme} />;
  }

  if (IS_KEYPAD) {
    return <KeypadPage theme={theme} onToggleTheme={toggleTheme} />;
  }

  return IS_ADMIN ? (
    <AdminApp theme={theme} onToggleTheme={toggleTheme} />
  ) : (
    <UnlockPage theme={theme} onToggleTheme={toggleTheme} />
  );
}

function AdminApp({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const { isAuthenticated, username, login, logout } = useAuth();

  if (!isAuthenticated) {
    return <LoginPage onLogin={login} theme={theme} onToggleTheme={onToggleTheme} />;
  }

  return <DashboardPage username={username} onLogout={logout} theme={theme} onToggleTheme={onToggleTheme} />;
}
