import { useState, type FormEvent } from "react";
import { Dices, Eye, EyeOff, LoaderCircle, Save } from "lucide-react";

import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api";
import { setMemberAccount } from "@/lib/door";
import type { Member } from "@/types";

const MIN_PASSWORD_LENGTH = 6;

// Letters and digits without look-alikes (no 0/O, 1/l/I).
const PASSWORD_CHARS = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function randomPassword(length = 10): string {
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(bytes, (value) => PASSWORD_CHARS[value % PASSWORD_CHARS.length]).join("");
}

// Suggests "aisyah" from "Aisyah Rahman" (first name, lower case, safe characters).
export function suggestUsername(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return first.toLowerCase().replace(/[^a-z0-9._-]/g, "");
}

interface AccountDialogProps {
  member: Member;
  onClose: () => void;
  onSaved: (member: Member, passwordChanged: boolean) => void;
}

// Admin creates or changes a person's sign-in for the /account page.
export function AccountDialog({ member, onClose, onSaved }: AccountDialogProps) {
  const exists = member.username !== null;
  const [username, setUsername] = useState(member.username ?? suggestUsername(member.name));
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(!exists);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordTooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH;
  const canSave =
    username.trim().length >= 3 && (exists || password.length >= MIN_PASSWORD_LENGTH) && !passwordTooShort && !saving;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const saved = await setMemberAccount(member.id, username.trim(), password === "" ? undefined : password);
      onSaved(saved, password !== "");
    } catch (err) {
      setError(errorMessage(err, "Couldn't save the account. Try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={exists ? `${member.name}'s account` : `Create an account for ${member.name}`}
      subtitle="They sign in at /account on their phone and open their doors from there"
      onClose={onClose}
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] font-medium tracking-[.14em] text-muted-foreground uppercase">
            Username
          </span>
          <Input
            autoFocus
            required
            minLength={3}
            maxLength={32}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="h-11 rounded-[14px] px-3.5"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] font-medium tracking-[.14em] text-muted-foreground uppercase">
            {exists ? "New password (leave empty to keep it)" : "Password"}
          </span>
          <div className="flex gap-2">
            <Input
              type={visible ? "text" : "password"}
              autoComplete="new-password"
              maxLength={64}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={exists ? "••••••••" : "At least 6 characters"}
              className="h-11 flex-1 rounded-[14px] px-3.5"
            />
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              aria-label={visible ? "Hide password" : "Show password"}
              onClick={() => setVisible((current) => !current)}
              className="h-11 w-11 rounded-[14px]"
            >
              {visible ? <EyeOff /> : <Eye />}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-lg"
              aria-label="Make a random password"
              onClick={() => {
                setPassword(randomPassword());
                setVisible(true);
              }}
              className="h-11 w-11 rounded-[14px]"
            >
              <Dices />
            </Button>
          </div>
        </label>

        {exists && member.passwordHint && (
          <p className="font-mono text-xs text-muted-foreground">Current password: {member.passwordHint}</p>
        )}
        {passwordTooShort && <p className="text-xs text-destructive">At least {MIN_PASSWORD_LENGTH} characters.</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}
        <p className="text-xs text-muted-foreground">
          Tell them their username and password yourself — it is shown here only while you type it. They can change the
          password on their own page.
        </p>

        <Button type="submit" className="h-11 w-full rounded-[14px] text-sm font-extrabold uppercase" disabled={!canSave}>
          {saving ? <LoaderCircle className="animate-spin" /> : <Save />}
          {exists ? "Save account" : "Create account"}
        </Button>
      </form>
    </Modal>
  );
}
