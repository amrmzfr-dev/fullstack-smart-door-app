import { useEffect } from "react";

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

// "/"              the app: admins see the dashboard + My doors, everyone else sees their doors
// "/sign-in"       the one sign-in page (signed-out visitors are sent here)
// "/keypad"        the old public PIN keypad (no login)
// "/install"       add the app to the phone home screen (shared when a person is created)
// "/setup/<token>" one-time phone fingerprint setup, opened on the person's phone
const PATH = window.location.pathname;
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

  return <SignedInApp theme={theme} onToggleTheme={toggleTheme} />;
}

// One sign-in page for everyone; what you see after it depends on who you are.
// Admins get the admin pages (plus My doors); everyone else gets just their doors.
function SignedInApp({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const admin = useAuth();
  const member = useMemberAuth();
  const signedIn = admin.isAuthenticated || member.isAuthenticated;

  // Like any other app: signed out -> /sign-in, signed in -> back to "/".
  useEffect(() => {
    const onSignIn = window.location.pathname.startsWith("/sign-in");
    if (!signedIn && !onSignIn) window.history.replaceState(null, "", "/sign-in");
    if (signedIn && window.location.pathname !== "/") window.history.replaceState(null, "", "/");
  }, [signedIn]);

  if (!signedIn) {
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
