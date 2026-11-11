import { useState, type FormEvent } from "react";
import { Check, Copy, Dices, LoaderCircle, Plus, Share2 } from "lucide-react";

import { randomPassword, suggestUsername } from "@/components/AccountDialog";
import { Modal } from "@/components/Modal";
import { Switch } from "@/components/Switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/api";
import { createMember, setMemberAdmin } from "@/lib/door";
import type { Member } from "@/types";

const MIN_PASSWORD_LENGTH = 6;

interface CreatedAccount {
  member: Member;
  username: string;
  password: string;
  adminFailed: boolean;
}

// The text an admin sends to the new person: where to sign in, plus the login.
function buildShareMessage(name: string, username: string, password: string, isAdmin: boolean): string {
  const lines = [
    `Hi ${name}, here is your Smart Door sign-in.`,
    "",
    `Open: ${window.location.origin}`,
    `Username: ${username}`,
    `Password: ${password}`,
  ];
  if (isAdmin) {
    lines.push("", "You also have admin access: you will see Overview, Doors, People and Log after you sign in.");
  }
  return lines.join("\n");
}

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

  const [makeAdmin, setMakeAdmin] = useState(false);
  const [created, setCreated] = useState<CreatedAccount | null>(null);
  const [copied, setCopied] = useState(false);

  const copyMessage = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked: the text is on screen to copy by hand.
    }
  };

  const accountReady =!withAccount || (username.trim().length >= 3 && password.length >= MIN_PASSWORD_LENGTH);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      let member = await createMember(
        name.trim(),
        withAccount ? username.trim() : undefined,
        withAccount ? password : undefined,
      );
      let adminFailed = false;
      if (withAccount && makeAdmin) {
        try {
          member = await setMemberAdmin(member.id, true);
        } catch {
          adminFailed = true;
        }
      }
      if (withAccount) {
        // The password is only known right now, so this is the moment to share it.
        setCreated({ member, username: username.trim(), password, adminFailed });
      } else {
        onCreated(member);
      }
    } catch (err) {
      setError(errorMessage(err, "Couldn't add this person. Try again."));
    } finally {
      setSaving(false);
    }
  };

  if (created) {
    const message = buildShareMessage(created.member.name, created.username, created.password, created.member.isAdmin);
    const finish = () => onCreated(created.member);
    return (
      <Modal title={`${created.member.name} added`} subtitle="Send them their sign-in" onClose={finish}>
        <div className="space-y-4">
          {created.adminFailed && (
            <p className="text-xs text-destructive">
              The person was added, but we couldn't make them an admin. Do it from the People list.
            </p>
          )}
          <pre className="rounded-[14px] border border-border bg-soft p-3 font-sans text-sm whitespace-pre-wrap">
            {message}
          </pre>
          <p className="text-xs text-muted-foreground">
            This is the only time the password is shown in full. Copy it now.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-[50px] flex-1 rounded-full text-[15px] font-semibold"
              onClick={() => void copyMessage(message)}
            >
              {copied ? <Check /> : <Copy />}
              {copied ? "Copied" : "Copy message"}
            </Button>
            {typeof navigator.share === "function" && (
              <Button
                type="button"
                variant="outline"
                className="h-[50px] flex-1 rounded-full text-[15px] font-semibold"
                onClick={() => void navigator.share({ text: message }).catch(() => undefined)}
              >
                <Share2 />
                Share
              </Button>
            )}
          </div>
          <Button type="button" className="h-[50px] w-full rounded-full text-[15px] font-semibold" onClick={finish}>
            Done
          </Button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Add a person" subtitle="With a sign-in, they can open doors from their own phone" onClose={onClose}>
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">
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

        <div className="flex items-center gap-3 rounded-[14px] border border-border bg-soft p-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Create a sign-in now</p>
            <p className="text-xs text-muted-foreground">Username and password for the /account page</p>
          </div>
          <Switch checked={withAccount} onChange={setWithAccount} label="Create a sign-in now" />
        </div>

        {withAccount && (
          <div className="space-y-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
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
              <span className="text-xs font-medium text-muted-foreground">
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

            <div className="flex items-center gap-3 rounded-[14px] border border-border bg-soft p-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Make them an admin</p>
                <p className="text-xs text-muted-foreground">
                  They can add people and manage doors. Leave off for a normal member.
                </p>
              </div>
              <Switch checked={makeAdmin} onChange={setMakeAdmin} label="Make them an admin" />
            </div>
          </div>
        )}

        {error &&<p className="text-xs text-destructive">{error}</p>}
        <Button
          type="submit"
          className="h-[50px] w-full rounded-full text-[15px] font-semibold"
          disabled={saving || name.trim().length === 0 || !accountReady}
        >
          {saving ? <LoaderCircle className="animate-spin" /> : <Plus />}
          Add person
        </Button>
      </form>
    </Modal>
  );
}
