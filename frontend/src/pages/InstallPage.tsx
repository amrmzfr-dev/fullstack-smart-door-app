import { useState, type ReactNode } from "react";
import { CircleCheck, DoorClosed, Download, EllipsisVertical, Plus, Share } from "lucide-react";

import { ThemeToggle } from "@/components/ThemeToggle";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import type { Theme } from "@/lib/theme";

interface InstallPageProps {
  theme: Theme;
  onToggleTheme: () => void;
}

// The page an admin shares with a new person. It puts the Smart Door icon on
// the phone's home screen, but only after the person taps and agrees: browsers
// never allow an install without that.
export function InstallPage({ theme, onToggleTheme }: InstallPageProps) {
  const { platform, install } = useInstallPrompt();
  const [declined, setDeclined] = useState(false);

  const onInstall = async () => {
    const accepted = await install();
    setDeclined(!accepted);
  };

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <header className="flex items-center justify-between px-4 pt-[max(12px,env(safe-area-inset-top))] sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-[10px] bg-primary text-primary-foreground">
            <DoorClosed className="size-4" strokeWidth={2.25} />
          </div>
          <span className="text-base font-semibold tracking-tight">Smart Door</span>
        </div>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </header>

      <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 px-6 pb-[max(24px,env(safe-area-inset-bottom))] text-center">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">Put Smart Door on your phone</h1>
          <p className="text-sm text-muted-foreground">
            One tap puts the app icon on your home screen, so you can open the door like any other app.
          </p>
        </div>

        {platform === "installed" && (
          <div className="space-y-4">
            <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary/15 text-primary">
              <CircleCheck className="size-7" />
            </div>
            <p className="text-sm">The app is already on this phone.</p>
            <a
              href="/"
              className="inline-block rounded-[16px] bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground"
            >
              Open Smart Door
            </a>
          </div>
        )}

        {platform === "prompt" && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => void onInstall()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-[16px] bg-primary px-6 py-3.5 text-sm font-semibold text-primary-foreground"
            >
              <Download className="size-4" />
              Add to home screen
            </button>
            <p className="text-xs text-muted-foreground">
              Your phone will ask you to confirm. Nothing is installed until you say yes.
            </p>
            {declined && <p className="text-xs text-muted-foreground">No problem. Tap the button when you're ready.</p>}
          </div>
        )}

        {platform === "ios" && (
          <ol className="space-y-3 text-left text-sm">
            <Step n={1}>
              Open this page in <strong>Safari</strong>.
            </Step>
            <Step n={2}>
              Tap the <Share className="mx-0.5 inline size-4 align-text-bottom" /> <strong>Share</strong> button at the
              bottom of the screen.
            </Step>
            <Step n={3}>
              Choose <Plus className="mx-0.5 inline size-4 align-text-bottom" /> <strong>Add to Home Screen</strong>,
              then tap <strong>Add</strong>.
            </Step>
          </ol>
        )}

        {platform === "other" && (
          <ol className="space-y-3 text-left text-sm">
            <Step n={1}>
              Open this page in <strong>Chrome</strong> on your phone.
            </Step>
            <Step n={2}>
              Tap the <EllipsisVertical className="mx-0.5 inline size-4 align-text-bottom" /> menu at the top right.
            </Step>
            <Step n={3}>
              Choose <strong>Add to Home screen</strong> (or <strong>Install app</strong>), then confirm.
            </Step>
          </ol>
        )}

        {platform !== "installed" && (
          <a href="/" className="text-xs text-muted-foreground underline underline-offset-4">
            Skip and just open the page
          </a>
        )}
      </main>
    </div>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 rounded-[14px] border border-border bg-card p-3">
      <span className="flex size-6 flex-none items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
        {n}
      </span>
      <span className="pt-0.5">{children}</span>
    </li>
  );
}
