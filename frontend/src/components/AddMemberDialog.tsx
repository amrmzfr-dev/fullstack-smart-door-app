import { useState, type FormEvent } from "react";
import { Dices, LoaderCircle, Plus } from "lucide-react";

import { randomPassword, suggestUsername } from "@/components/AccountDialog";
import { Modal } from "@/components/Modal";
import { Switch } from "@/components/Switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api";
import { createMember } from "@/lib/door";
import type { Member } from "@/types";

const MIN_PASSWORD_LENGTH = 6;

interface AddMemberDialogProps {
  onClose: () => void;
  onCreated: (member: Member) => void;
}

export function AddMemberDialog({ onClose, onCreated }: AddMemberDialogProps) {
  const [name, setName] = useState("");
  const [withAccount, setWithAccount] = useState(true);
  const [username, setUsername] = useState("");
  const [usernameEdited, setUsernameEdited] = useState(false);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accountReady = !withAccount || (username.trim().length >= 3 && password.length >= MIN_PASSWORD_LENGTH);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      onCreated(
        await createMember(name.trim(), withAccount ? username.trim() : undefined, withAccount ? password : undefined),
      );
    } catch (err) {
      setError(errorMessage(err, "Couldn't add this person. Try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Add a person" subtitle="With a sign-in, they can open doors from their own phone" onClose={onClose}>
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-[10px] font-medium tracking-[.14em] text-muted-foreground uppercase">
            Name
          </span>
          <Input
            autoFocus
            required
            maxLength={64}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (!usernameEdited) setUsername(suggestUsername(event.target.value));
            }}
            placeholder="e.g. Aisyah"
            className="h-11 rounded-[14px] px-3.5"
          />
        </label>

        <div className="flex items-center gap-3 rounded-[14px] bg-secondary/60 p-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">Create a sign-in now</p>
            <p className="text-xs text-muted-foreground">Username and password for the /account page</p>
          </div>
          <Switch checked={withAccount} onChange={setWithAccount} label="Create a sign-in now" />
        </div>

        {withAccount && (
          <div className="space-y-3">
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] font-medium tracking-[.14em] text-muted-foreground uppercase">
                Username
              </span>
              <Input
                required
                minLength={3}
                maxLength={32}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={username}
                onChange={(event) => {
                  setUsername(event.target.value);
                  setUsernameEdited(true);
                }}
                className="h-11 rounded-[14px] px-3.5"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="font-mono text-[10px] font-medium tracking-[.14em] text-muted-foreground uppercase">
                Password
              </span>
              <div className="flex gap-2">
                <Input
                  required
                  autoComplete="new-password"
                  maxLength={64}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 6 characters"
                  className="h-11 flex-1 rounded-[14px] px-3.5"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon-lg"
                  aria-label="Make a random password"
                  onClick={() => setPassword(randomPassword())}
                  className="h-11 w-11 rounded-[14px]"
                >
                  <Dices />
                </Button>
              </div>
            </label>
          </div>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}
        <Button
          type="submit"
          className="h-11 w-full rounded-[14px] text-sm font-extrabold uppercase"
          disabled={saving || name.trim().length === 0 || !accountReady}
        >
          {saving ? <LoaderCircle className="animate-spin" /> : <Plus />}
          Add person
        </Button>
      </form>
    </Modal>
  );
}
