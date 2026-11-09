import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search, Users } from "lucide-react";

import { AccountDialog } from "@/components/AccountDialog";
import { AddMemberDialog } from "@/components/AddMemberDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EnrollFingerprintDialog } from "@/components/EnrollFingerprintDialog";
import { MemberCard } from "@/components/MemberCard";
import { MemberHistoryDialog } from "@/components/MemberHistoryDialog";
import { PhoneInviteDialog } from "@/components/PhoneInviteDialog";
import { SectionHeading } from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMembers } from "@/hooks/useDoorData";
import { errorMessage } from "@/lib/api";
import {
  clearMemberAccount,
  deleteFingerprint,
  deleteMember,
  deletePhoneKey,
  setMemberAdmin,
  setMemberDoors,
  updateMember,
} from "@/lib/door";
import { cn } from "@/lib/utils";
import type { Door, Fingerprint, Member, PhoneKey } from "@/types";

const NOTICE_MS = 4000;

type Dialog =
  | { kind: "add" }
  | { kind: "enroll"; member: Member; door: Door }
  | { kind: "phone-invite"; member: Member }
  | { kind: "account"; member: Member }
  | { kind: "history"; member: Member }
  | { kind: "remove-account"; member: Member }
  | { kind: "set-admin"; member: Member; isAdmin: boolean }
  | { kind: "delete-member"; member: Member }
  | { kind: "delete-fingerprint"; member: Member; fingerprint: Fingerprint }
  | { kind: "delete-phone"; member: Member; phone: PhoneKey };

type Filter = "all" | "enabled" | "disabled" | "no-account" | "no-access";

const FILTERS: ReadonlyArray<{ key: Filter; label: string }> = [
  { key: "all", label: "Everyone" },
  { key: "enabled", label: "Enabled" },
  { key: "disabled", label: "Disabled" },
  { key: "no-account", label: "No sign-in" },
  { key: "no-access", label: "No way in" },
];

interface Notice {
  tone: "success" | "error";
  text: string;
}

// "No way in" = nothing registered at all: no fingerprint, no phone and no
// sign-in, so this person can only use the shared door PIN.
function hasNoWayIn(member: Member): boolean {
  return member.fingerprints.length === 0 && member.phones.length === 0 && member.username === null;
}

export function PeopleTab({ doors }: { doors: Door[] }) {
  const { members, loading, error, reload } = useMembers();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    if (notice === null) return;
    const timer = window.setTimeout(() => setNotice(null), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const closeDialog = useCallback(() => setDialog(null), []);

  // Runs one change for a member card, then refreshes the list.
  const runForMember = async (member: Member, action: () => Promise<unknown>, success: string) => {
    setBusyId(member.id);
    try {
      await action();
      setNotice({ tone: "success", text: success });
    } catch (err) {
      setNotice({ tone: "error", text: errorMessage(err, "Something went wrong. Try again.") });
    } finally {
      setBusyId(null);
      await reload();
    }
  };

  const confirmSetAdmin = async () => {
    const target = dialog;
    if (target === null || target.kind !== "set-admin") return;
    setDeleting(true);
    try {
      await setMemberAdmin(target.member.id, target.isAdmin);
      setNotice({
        tone: "success",
        text: target.isAdmin
          ? `${target.member.name} can now use the admin panel`
          : `${target.member.name} no longer has the admin panel`,
      });
      setDialog(null);
    } catch (err) {
      setNotice({ tone: "error", text: errorMessage(err, "Couldn't change admin access. Try again.") });
    } finally {
      setDeleting(false);
      await reload();
    }
  };

  const confirmDelete = async () => {
    const target = dialog;
    if (
      target === null ||
      (target.kind !== "delete-member" &&
        target.kind !== "delete-fingerprint" &&
        target.kind !== "delete-phone" &&
        target.kind !== "remove-account")
    )
      return;
    setDeleting(true);
    try {
      if (target.kind === "delete-member") {
        await deleteMember(target.member.id);
        setNotice({ tone: "success", text: `${target.member.name} removed` });
      } else if (target.kind === "delete-fingerprint") {
        await deleteFingerprint(target.fingerprint.id);
        setNotice({ tone: "success", text: `${target.fingerprint.label} removed from ${target.member.name}` });
      } else if (target.kind === "remove-account") {
        await clearMemberAccount(target.member.id);
        setNotice({ tone: "success", text: `${target.member.name}'s sign-in removed` });
      } else {
        await deletePhoneKey(target.phone.id);
        setNotice({ tone: "success", text: `${target.phone.label} removed from ${target.member.name}` });
      }
      setDialog(null);
    } catch (err) {
      setNotice({ tone: "error", text: errorMessage(err, "Couldn't delete. Try again.") });
    } finally {
      setDeleting(false);
      await reload();
    }
  };

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return members.filter((member) => {
      if (
        needle !== "" &&
        !member.name.toLowerCase().includes(needle) &&
        !(member.username ?? "").toLowerCase().includes(needle)
      ) {
        return false;
      }
      switch (filter) {
        case "enabled":
          return member.enabled;
        case "disabled":
          return !member.enabled;
        case "no-account":
          return member.username === null;
        case "no-access":
          return hasNoWayIn(member);
        case "all":
          return true;
      }
    });
  }, [members, query, filter]);

  const counts: Record<Filter, number> = {
    all: members.length,
    enabled: members.filter((member) => member.enabled).length,
    disabled: members.filter((member) => !member.enabled).length,
    "no-account": members.filter((member) => member.username === null).length,
    "no-access": members.filter(hasNoWayIn).length,
  };

  const fingerprintCount = members.reduce((total, member) => total + member.fingerprints.length, 0);
  const phoneCount = members.reduce((total, member) => total + member.phones.length, 0);
  const accountCount = members.filter((member) => member.username !== null).length;

  return (
    <div className="space-y-4">
      <SectionHeading label="People" title="Accounts, fingerprints and phones">
        <Button onClick={() => setDialog({ kind: "add" })}>
          <Plus />
          Add person
        </Button>
      </SectionHeading>

      <p className="text-xs text-muted-foreground">
        {members.length} {members.length === 1 ? "person" : "people"} · {accountCount}{" "}
        {accountCount === 1 ? "sign-in" : "sign-ins"} · {fingerprintCount}{" "}
        {fingerprintCount === 1 ? "fingerprint" : "fingerprints"} · {phoneCount} {phoneCount === 1 ? "phone" : "phones"}
        {doors.some((door) => !door.online) &&
          " · Offline doors pick up changes when they reconnect; adding a fingerprint needs that door online"}
      </p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name or username"
            aria-label="Search people"
            className="h-9 rounded-[12px] pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={cn(
                "rounded-full border px-3 py-1.5 font-mono text-[10px] font-medium tracking-[.12em] uppercase transition-colors",
                filter === key
                  ? "border-transparent bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              {label} · {counts[key]}
            </button>
          ))}
        </div>
      </div>

      {notice && (
        <p
          className={cn(
            "rounded-[12px] px-3 py-2 text-sm",
            notice.tone === "success" ? "bg-success/15 text-success" : "bg-destructive/10 text-destructive",
          )}
        >
          {notice.text}
        </p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[18px] border border-dashed border-border p-10 text-center">
          <Users className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {loading
              ? "Loading people…"
              : members.length === 0
                ? "No one added yet. Add a person and give them a sign-in, a fingerprint or a phone."
                : "No one matches this search."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((member) => (
            <MemberCard
              key={member.id}
              member={member}
              doors={doors}
              busy={busyId === member.id}
              onToggleEnabled={(enabled) =>
                void runForMember(
                  member,
                  () => updateMember(member.id, member.name, enabled),
                  `${member.name} ${enabled ? "enabled" : "disabled"}`,
                )
              }
              onToggleDoor={(door, allowed) =>
                void runForMember(
                  member,
                  () =>
                    setMemberDoors(
                      member.id,
                      allowed ? [...member.doorIds, door.id] : member.doorIds.filter((id) => id !== door.id),
                    ),
                  allowed ? `${member.name} can open ${door.name}` : `${member.name} can no longer open ${door.name}`,
                )
              }
              onAddFingerprint={(door) => setDialog({ kind: "enroll", member, door })}
              onDeleteFingerprint={(fingerprint) => setDialog({ kind: "delete-fingerprint", member, fingerprint })}
              onSetUpPhone={() => setDialog({ kind: "phone-invite", member })}
              onDeletePhone={(phone) => setDialog({ kind: "delete-phone", member, phone })}
              onDelete={() => setDialog({ kind: "delete-member", member })}
              onManageAccount={() => setDialog({ kind: "account", member })}
              onRemoveAccount={() => setDialog({ kind: "remove-account", member })}
              onToggleAdmin={(isAdmin) => setDialog({ kind: "set-admin", member, isAdmin })}
              onHistory={() => setDialog({ kind: "history", member })}
            />
          ))}
        </div>
      )}

      {dialog?.kind === "add" && (
        <AddMemberDialog
          onClose={closeDialog}
          onCreated={(member) => {
            setNotice({
              tone: "success",
              text: member.username
                ? `${member.name} added — they can sign in as ${member.username}`
                : `${member.name} added`,
            });
            setDialog(null);
            void reload();
          }}
        />
      )}

      {dialog?.kind === "account" && (
        <AccountDialog
          member={members.find((m) => m.id === dialog.member.id) ?? dialog.member}
          onClose={closeDialog}
          onSaved={(saved, passwordChanged) => {
            setNotice({
              tone: "success",
              text: passwordChanged
                ? `${saved.name}'s account saved with the new password`
                : `${saved.name}'s account saved`,
            });
            setDialog(null);
            void reload();
          }}
        />
      )}

      {dialog?.kind === "history" && <MemberHistoryDialog member={dialog.member} onClose={closeDialog} />}

      {dialog?.kind === "enroll" && (
        <EnrollFingerprintDialog
          member={dialog.member}
          door={doors.find((door) => door.id === dialog.door.id) ?? dialog.door}
          onClose={() => {
            setDialog(null);
            void reload();
          }}
        />
      )}

      {dialog?.kind === "delete-member" && (
        <ConfirmDialog
          title={`Delete ${dialog.member.name}?`}
          detail="Their sign-in stops working and their fingerprints are wiped from the sensors. Their past entries stay in the log."
          busy={deleting}
          onCancel={closeDialog}
          onConfirmed={() => void confirmDelete()}
        />
      )}

      {dialog?.kind === "remove-account" && (
        <ConfirmDialog
          title={`Remove ${dialog.member.name}'s sign-in?`}
          detail="They can no longer sign in on the account page. Their fingerprints and phones keep working."
          busy={deleting}
          onCancel={closeDialog}
          onConfirmed={() => void confirmDelete()}
        />
      )}

      {dialog?.kind === "phone-invite" && (
        <PhoneInviteDialog
          member={dialog.member}
          onClose={() => {
            setDialog(null);
            void reload();
          }}
        />
      )}

      {dialog?.kind === "set-admin" && (
        <ConfirmDialog
          title={dialog.isAdmin ? `Make ${dialog.member.name} an admin?` : `Take admin away from ${dialog.member.name}?`}
          detail={
            dialog.isAdmin
              ? "They will be able to change doors, PINs, people and read the log from their phone. They can also make others admin."
              : "They go back to only unlocking doors. It takes full effect within a day."
          }
          busy={deleting}
          onCancel={closeDialog}
          onConfirmed={() => void confirmSetAdmin()}
        />
      )}

      {dialog?.kind === "delete-phone" && (
        <ConfirmDialog
          title={`Remove ${dialog.phone.label}?`}
          detail={`${dialog.member.name} won't be able to open the door with this phone's fingerprint any more.`}
          busy={deleting}
          onCancel={closeDialog}
          onConfirmed={() => void confirmDelete()}
        />
      )}

      {dialog?.kind === "delete-fingerprint" && (
        <ConfirmDialog
          title={`Remove ${dialog.fingerprint.label}?`}
          detail={`${dialog.member.name} won't be able to open the door with this finger any more.`}
          busy={deleting}
          onCancel={closeDialog}
          onConfirmed={() => void confirmDelete()}
        />
      )}
    </div>
  );
}
