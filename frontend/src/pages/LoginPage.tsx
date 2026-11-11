import { useState, type FormEvent, type ReactNode } from "react";
import { DoorClosed, Eye, EyeOff, LoaderCircle, Lock } from "lucide-react";

import { ThemeToggle } from "@/components/ThemeToggle";
import { HttpError } from "@/lib/api";
import type { Theme } from "@/lib/theme";

interface LoginPageProps {
  onLogin: (username: string, password: string) => Promise<void>;
  theme: Theme;
  onToggleTheme: () => void;
  // Line under the title; defaults to the admin wording.
  subtitle?: string;
}

const INPUT_CLASS =
  "h-12 w-full rounded-[14px] border border-input bg-card px-4 text-sm font-medium text-card-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

export function LoginPage({
  onLogin,
  theme,
  onToggleTheme,
  subtitle = "Sign in to manage PINs, fingerprints and the lock",
}: LoginPageProps) {
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
          ? err.message || "Wrong username or password."
          : "Couldn't reach the server. Try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-dvh justify-center bg-page">
      <div className="relative flex min-h-dvh w-full max-w-[440px] flex-col justify-center bg-background p-6 sm:shadow-[0_20px_60px_rgba(15,40,80,.12)] lg:my-auto lg:min-h-0 lg:max-w-[480px] lg:rounded-[32px] lg:p-10">
        <div className="absolute top-[max(18px,env(safe-area-inset-top))] right-[18px]">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
        </div>

        <div className="flex flex-col gap-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <DoorClosed className="size-7" strokeWidth={1.8} />
            </div>
            <div>
              <h1 className="text-[28px] leading-tight font-semibold tracking-[-.02em]">Smart Door</h1>
              <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
            </div>
          </div>

          <form
            onSubmit={(event) => void handleSubmit(event)}
            className="flex flex-col gap-4 rounded-[28px] border border-border bg-card p-5"
          >
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
                  className={`${INPUT_CLASS} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>

            {error && <span className="text-xs text-destructive">{error}</span>}

            <button
              type="submit"
              disabled={submitting}
              className="flex h-[54px] items-center justify-center gap-2.5 rounded-full bg-foreground text-[15px] font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {submitting ? <LoaderCircle className="size-[18px] animate-spin" /> : <Lock className="size-[18px]" strokeWidth={1.8} />}
              Sign in
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
