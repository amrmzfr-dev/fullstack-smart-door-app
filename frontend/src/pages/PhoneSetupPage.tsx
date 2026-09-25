import { useEffect, useState, type ReactNode } from "react";
import { CircleCheck, DoorClosed, FingerprintPattern, TriangleAlert } from "lucide-react";

import { ThemeToggle } from "@/components/ThemeToggle";
import { HttpError } from "@/lib/api";
import type { Theme } from "@/lib/theme";
import { fetchPhoneInvite, setUpPhone } from "@/lib/unlock";
import { cn } from "@/lib/utils";
import { hasPhoneFingerprint, isCancelled } from "@/lib/webauthn";

type Phase = "loading" | "invalid" | "unsupported" | "ready" | "scanning" | "done" | "error";

interface PhoneSetupPageProps {
  token: string;
  theme: Theme;
  onToggleTheme: () => void;
}

// Opened on a person's own phone from the one-time link the admin sent.
// One tap, the phone checks the fingerprint (or face) it already knows, and
// from then on that phone's fingerprint opens the door in the keypad app.
export function PhoneSetupPage({ token, theme, onToggleTheme }: PhoneSetupPageProps) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [memberName, setMemberName] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [invite, supported] = await Promise.all([fetchPhoneInvite(token), hasPhoneFingerprint()]);
        if (cancelled) return;
        setMemberName(invite.memberName);
        setPhase(supported ? "ready" : "unsupported");
      } catch (err) {
        if (cancelled) return;
        setMessage(err instanceof HttpError && err.status === 404 ? err.message : "Couldn't open this link. Try again.");
        setPhase("invalid");
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const scan = async () => {
    setPhase("scanning");
    setMessage(null);
    try {
      await setUpPhone(token);
      setPhase("done");
    } catch (err) {
      if (isCancelled(err)) {
        setMessage("Cancelled — tap the fingerprint to try again.");
      } else if (err instanceof HttpError && err.status === 404) {
        // Link expired or was already used while this page was open.
        setMessage(err.message);
        setPhase("invalid");
        return;
      } else if (err instanceof HttpError && err.status < 500) {
        setMessage(err.message);
      } else {
        setMessage("Something went wrong. Tap the fingerprint to try again.");
      }
      setPhase("error");
    }
  };

  const canScan = phase === "ready" || phase === "error";

  return (
    <div className="keypad-page flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <header className="flex flex-none items-center justify-between px-3 pt-[max(clamp(6px,1.5dvh,16px),env(safe-area-inset-top))] sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-[10px] bg-primary text-primary-foreground">
            <DoorClosed className="size-4" strokeWidth={2.25} />
          </div>
          <span className="text-base font-extrabold tracking-tight uppercase">Smart Door</span>
        </div>
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </header>

      <main className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[calc(var(--gap)*2)] px-6 pb-[max(clamp(6px,1.5dvh,16px),env(safe-area-inset-bottom))] text-center">
        {phase === "loading" && <p className="text-sm text-muted-foreground">Opening your setup link…</p>}

        {phase === "invalid" && (
          <StatusBlock icon={<TriangleAlert className="size-7" />} tone="error" title="Link not valid">
            {message}
          </StatusBlock>
        )}

        {phase === "unsupported" && (
          <StatusBlock icon={<TriangleAlert className="size-7" />} tone="error" title="No fingerprint on this phone">
            Add a fingerprint (or Face ID) in your phone's Settings first, then open this link again. It has to be
            opened on the phone you'll use to open the door.
          </StatusBlock>
        )}

        {phase === "done" && (
          <>
            <StatusBlock icon={<CircleCheck className="size-7" />} tone="success" title="All set">
              {memberName}, this phone can now open the door. Open the Smart Door page on this phone and tap the
              fingerprint.
            </StatusBlock>
            <a
              href="/"
              className="key3d key3d-primary rounded-[16px] px-6 py-3 text-sm font-extrabold tracking-tight uppercase"
            >
              Go to the keypad
            </a>
          </>
        )}

        {(phase === "ready" || phase === "scanning" || phase === "error") && (
          <>
            <div className="space-y-2">
              <p className="font-mono text-[11px] tracking-[.16em] text-muted-foreground uppercase">
                Phone fingerprint setup
              </p>
              <h1 className="text-[clamp(22px,4dvh,32px)] leading-tight font-extrabold tracking-tight">
                Hi {memberName}
              </h1>
              <p className="mx-auto max-w-[300px] text-sm text-muted-foreground">
                Tap the fingerprint, then touch your phone's fingerprint reader (or look at it for Face ID) when it
                asks. Just once.
              </p>
            </div>

            <button
              type="button"
              aria-label="Set up fingerprint on this phone"
              disabled={!canScan}
              onClick={() => void scan()}
              className="relative flex size-[clamp(96px,22dvh,160px)] items-center justify-center rounded-full select-none"
            >
              {phase === "scanning" && (
                <>
                  <span className="pointer-events-none absolute inset-0 rounded-full bg-primary/40 animate-gc-pulse" />
                  <span className="pointer-events-none absolute inset-0 rounded-full bg-primary/25 animate-gc-pulse [animation-delay:0.7s]" />
                </>
              )}
              <span
                data-down={phase === "scanning"}
                className="key3d key3d-primary relative flex size-full items-center justify-center rounded-full text-primary-foreground"
              >
                <FingerprintPattern className="size-[45%]" strokeWidth={1.5} />
              </span>
            </button>

            <p
              className={cn(
                "min-h-10 max-w-[300px] text-sm",
                phase === "error" ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {phase === "scanning" ? "Follow your phone's prompt…" : (message ?? "This link works once.")}
            </p>
          </>
        )}
      </main>
    </div>
  );
}

interface StatusBlockProps {
  icon: ReactNode;
  tone: "success" | "error";
  title: string;
  children: ReactNode;
}

function StatusBlock({ icon, tone, title, children }: StatusBlockProps) {
  return (
    <div className="flex max-w-[320px] flex-col items-center gap-3">
      <div
        className={cn(
          "flex size-14 items-center justify-center rounded-full",
          tone === "success" ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive",
        )}
      >
        {icon}
      </div>
      <h1 className="text-2xl font-extrabold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  );
}
