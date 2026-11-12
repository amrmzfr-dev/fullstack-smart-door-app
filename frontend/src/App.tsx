import { useAuth } from "@/hooks/useAuth";
import { useMemberAuth } from "@/hooks/useMemberAuth";
import { useTheme } from "@/hooks/useTheme";
import type { Theme } from "@/lib/theme";
import { AccountHome } from "@/pages/AccountPage";
import { DashboardPage } from "@/pages/DashboardPage";
import { InstallPage } from "@/pages/InstallPage";
import { KeypadPage } from "@/pages/KeypadPage";
import { LoginPage } from "@/pages/LoginPage";
import { PhoneSetupPage } from "@/pages/PhoneSetupPage";
import { UnlockPage } from "@/pages/UnlockPage";

// "/"              simple page: sign in, door status, Unlock button
// "/keypad"        the old public PIN keypad (no login)
// "/admin", "/account"  the same page: one sign-in. Admins see the dashboard + My doors, others see their doors
// "/install"      add the app to the phone home screen (shared when a person is created)
// "/setup/<token>" one-time phone fingerprint setup, opened on the person's phone
const PATH = window.location.pathname;
const IS_ADMIN = PATH.startsWith("/admin");
const IS_ACCOUNT = PATH.startsWith("/account");
const IS_INSTALL = PATH.startsWith("/install");
const IS_KEYPAD = PATH.startsWith("/keypad");
const SETUP_TOKEN = PATH.startsWith("/setup/") ? decodeURIComponent(PATH.slice("/setup/".length)) : null;

export function App() {
  const { theme, toggleTheme } = useTheme();

  if (SETUP_TOKEN) {
    return <PhoneSetupPage token={SETUP_TOKEN} theme={theme} onToggleTheme={toggleTheme} />;
  }

  if (IS_INSTALL) {
    return <InstallPage theme={theme} onToggleTheme={toggleTheme} />;
  }

  if (IS_KEYPAD) {
    return <KeypadPage theme={theme} onToggleTheme={toggleTheme} />;
  }

  return IS_ADMIN || IS_ACCOUNT ? (
    <SignedInApp theme={theme} onToggleTheme={toggleTheme} />
  ) : (
    <UnlockPage theme={theme} onToggleTheme={toggleTheme} />
  );
}

// /admin and /account are the same page: one sign-in, and what you see depends on who you are.
// Admins get the admin pages (plus My doors); everyone else gets just their doors.
function SignedInApp({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const admin = useAuth();
  const member = useMemberAuth();

  if (!admin.isAuthenticated && !member.isAuthenticated) {
    return (
      <LoginPage
        onLogin={admin.login}
        theme={theme}
        onToggleTheme={onToggleTheme}
        subtitle="Sign in to open your doors and manage the app"
      />
    );
  }

  if (admin.isAuthenticated) {
    return (
      <DashboardPage
        username={admin.username}
        hasMyDoors={member.isAuthenticated}
        onLogout={admin.logout}
        theme={theme}
        onToggleTheme={onToggleTheme}
      />
    );
  }

  return <AccountHome onLogout={admin.logout} theme={theme} onToggleTheme={onToggleTheme} />;
}
