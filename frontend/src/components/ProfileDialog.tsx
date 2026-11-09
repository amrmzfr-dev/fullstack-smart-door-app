import { useEffect, useState, type FormEvent } from "react";
import { LoaderCircle, UserRound } from "lucide-react";

import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api";
import { changePassword, fetchMe } from "@/lib/account";
import type { Me } from "@/types";

const MIN_PASSWORD_LENGTH = 6;

interface ProfileDialogProps {
  onClose: () => void;
}

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  autoFocus?: boolean;
}

function PasswordField({ label, value, onChange, autoComplete, autoFocus }: FieldProps) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Input
        type="password"
        required
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        maxLength={64}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 rounded-[14px] px-3.5"
      />
    </label>
  );
}

// The signed-in admin's own profile: who they are, a hint of their current
// password (first and last two characters) and a form to change it.
export function ProfileDialog({ onClose }: ProfileDialogProps) {
  const [me, setMe] = useState<Me | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchMe()
      .then((result) => {
        if (!cancelled) setMe(result);
      })
      .catch(() => {
        // The hint is a nice-to-have; the form still works without it.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const tooShort = next.length > 0 && next.length < MIN_PASSWORD_LENGTH;
  const mismatch = again.length > 0 && next !== again;
  const canSave = current.length > 0 && next.length >= MIN_PASSWORD_LENGTH && next === again && !saving;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      setMe(await changePassword(current, next));
      setCurrent("");
      setNext("");
      setAgain("");
      setSaved(true);
    } catch (err) {
      setError(errorMessage(err, "Couldn't change the password. Try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="My profile" subtitle="Your sign-in for the Smart Door admin" onClose={onClose}>
      <div className="flex items-center gap-3 rounded-[14px] border border-border bg-soft p-3">
        <div className="flex size-10 flex-none items-center justify-center rounded-[12px] bg-primary text-primary-foreground">
          <UserRound className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold tracking-tight">{me?.username ?? "…"}</p>
          <p className="truncate font-mono text-xs text-muted-foreground">
            Password: {me?.passwordHint ?? "hint shows after your next sign-in"}
          </p>
        </div>
      </div>

      <form onSubmit={(event) => void submit(event)} className="space-y-3">
        <PasswordField label="Current password" value={current} onChange={setCurrent} autoComplete="current-password" autoFocus />
        <PasswordField label="New password" value={next} onChange={setNext} autoComplete="new-password" />
        <PasswordField label="New password again" value={again} onChange={setAgain} autoComplete="new-password" />

        {tooShort && <p className="text-xs text-destructive">At least {MIN_PASSWORD_LENGTH} characters.</p>}
        {mismatch && <p className="text-xs text-destructive">The two new passwords don't match.</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}
        {saved && <p className="rounded-[12px] bg-success/15 px-3 py-2 text-sm text-success">Password changed.</p>}

        <Button type="submit" className="h-[50px] w-full rounded-full text-[15px] font-semibold" disabled={!canSave}>
          {saving && <LoaderCircle className="animate-spin" />}
          Change password
        </Button>
      </form>
    </Modal>
  );
}
