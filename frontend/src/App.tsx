import { useLayoutEffect } from "react";

import { useMemberAuth } from "@/hooks/useMemberAuth";
import { useTheme } from "@/hooks/useTheme";
import type { Theme } from "@/lib/theme";
import { InstallPage } from "@/pages/InstallPage";
import { KeypadPage } from "@/pages/KeypadPage";
import { PhoneSetupPage } from "@/pages/PhoneSetupPage";
import { UnlockPage } from "@/pages/UnlockPage";

// "/"              the Unlock page. Admins also get Overview, Doors, People and Log in the bottom bar
// "/sign-in"       the sign-in page (signed-out visitors are sent here)
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

  return <Home theme={theme} onToggleTheme={toggleTheme} />;
}

// Sign in once. Signed out you are on /sign-in, signed in you are on "/".
// The Unlock page shows the sign-in form itself when nobody is signed in, and
// adds the admin pages when the person is an admin.
function Home({ theme, onToggleTheme }: { theme: Theme; onToggleTheme: () => void }) {
  const { isAuthenticated } = useMemberAuth();

  // Layout effect: the address must be right before the page starts loading its data.
  useLayoutEffect(() => {
    const onSignIn = window.location.pathname.startsWith("/sign-in");
    if (!isAuthenticated && !onSignIn) window.history.replaceState(null, "", "/sign-in");
    if (isAuthenticated && window.location.pathname !== "/") window.history.replaceState(null, "", "/");
  }, [isAuthenticated]);

  return <UnlockPage theme={theme} onToggleTheme={onToggleTheme} />;
}
