import { useState, type FormEvent, type ReactNode } from "react";
import { DoorClosed, Eye, EyeOff, LoaderCircle, Lock } from "lucide-react";

import { ThemeToggle } from "@/components/ThemeToggle";
import { HttpError } from "@/lib/api";
import type { Theme } from "@/lib/theme";

interface LoginPageProps {
  onLogin: (username: string, password: string) => Promise<void>;
  theme: Theme;
  onToggleTheme: () => void;
}

const INPUT_CLASS =
  "h-[46px] w-full rounded-[14px] border border-border bg-card px-3.5 text-sm font-medium text-card-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] font-medium tracking-[.14em] text-muted-foreground uppercase">{label}</span>
      {children}
    </label>
  );
}

export function LoginPage({ onLogin, theme, onToggleTheme }: LoginPageProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onLogin(username, password);
    } catch (err) {
      setError(
        err instanceof HttpError && err.status === 401
          ? "Wrong username or password."
          : "Couldn't reach the server. Try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-background p-6">
      <div className="absolute top-4 right-4">
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>

      <div className="flex w-full max-w-[340px] flex-col gap-7">
        <div className="flex flex-col items-center gap-2.5 text-center">
          <div className="flex size-12 items-center justify-center rounded-[12px] bg-primary text-primary-foreground">
            <DoorClosed className="size-6" strokeWidth={2.25} />
          </div>
          <h1 className="text-[26px] leading-[.95] font-extrabold tracking-[-.03em] uppercase">Smart Door</h1>
          <p className="font-mono text-[11px] tracking-[.04em] text-muted-foreground">
            Sign in to manage PINs, fingerprints and the lock
          </p>
        </div>

        <form onSubmit={(event) => void handleSubmit(event)} className="flex flex-col gap-3.5">
          <Field label="Username">
            <input
              name="username"
              autoComplete="username"
              autoFocus
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className={INPUT_CLASS}
            />
          </Field>

          <Field label="Password">
            <div className="relative">
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={`${INPUT_CLASS} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </Field>

          {error && <span className="text-xs text-destructive">{error}</span>}

          <button
            type="submit"
            disabled={submitting}
            className="flex h-[46px] items-center justify-center gap-2 rounded-[14px] bg-primary text-sm font-extrabold tracking-[-.01em] text-primary-foreground uppercase transition-opacity hover:opacity-90 disabled:opacity-70"
          >
            {submitting ? <LoaderCircle className="size-4 animate-spin" /> : <Lock className="size-4" />}
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
