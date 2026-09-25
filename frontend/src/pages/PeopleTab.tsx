import { useCallback, useEffect, useState } from "react";
import { Plus, Users } from "lucide-react";

import { AddMemberDialog } from "@/components/AddMemberDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EnrollFingerprintDialog } from "@/components/EnrollFingerprintDialog";
import { MemberCard } from "@/components/MemberCard";
import { PinPadDialog } from "@/components/PinPadDialog";
import { SectionHeading } from "@/components/SectionLabel";
import { Button } from "@/components/ui/button";
import { useMembers } from "@/hooks/useDoorData";
import { errorMessage } from "@/lib/api";
import { clearMemberPin, deleteFingerprint, deleteMember, deletePhoneKey, updateMember } from "@/lib/door";
import { cn } from "@/lib/utils";
import type { Fingerprint, Member, PhoneKey } from "@/types";

const NOTICE_MS = 4000;

type Dialog =
  | { kind: "add" }
  | { kind: "pin"; member: Member }
  | { kind: "enroll"; member: Member }
  | { kind: "delete-member"; member: Member }
  | { kind: "delete-fingerprint"; member: Member; fingerprint: Fingerprint }
  | { kind: "delete-phone"; member: Member; phone: PhoneKey };

interface Notice {
  tone: "success" | "error";
  text: string;
}

export function PeopleTab({ doorOnline }: { doorOnline: boolean }) {
  const { members, loading, error, reload } = useMembers();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

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

  const confirmDelete = async () => {
    const target = dialog;
    if (
      target === null ||
      (target.kind !== "delete-member" && target.kind !== "delete-fingerprint" && target.kind !== "delete-phone")
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

  const pinCount = members.filter((member) => member.hasPin).length;
  const fingerprintCount = members.reduce((total, member) => total + member.fingerprints.length, 0);

  return (
    <div className="space-y-4">
      <SectionHeading label="People" title="Who can open the door">
        <Button onClick={() => setDialog({ kind: "add" })}>
          <Plus />
          Add person
        </Button>
      </SectionHeading>

      <p className="text-xs text-muted-foreground">
        {members.length} {members.length === 1 ? "person" : "people"} · {pinCount} with a PIN · {fingerprintCount}{" "}
        {fingerprintCount === 1 ? "fingerprint" : "fingerprints"}
        {!doorOnline && " · Door offline: changes reach it when it reconnects, fingerprints need it online"}
      </p>

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

      {members.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-[18px] border border-dashed border-border p-10 text-center">
          <Users className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {loading ? "Loading people…" : "No one added yet. Add a person, then give them a PIN or a fingerprint."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {members.map((member) => (
            <MemberCard
              key={member.id}
              member={member}
              busy={busyId === member.id}
              onToggleEnabled={(enabled) =>
                void runForMember(
                  member,
                  () => updateMember(member.id, member.name, enabled),
                  `${member.name} ${enabled ? "enabled" : "disabled"}`,
                )
              }
              onSetPin={() => setDialog({ kind: "pin", member })}
              onClearPin={() =>
                void runForMember(member, () => clearMemberPin(member.id), `PIN removed for ${member.name}`)
              }
              onAddFingerprint={() => setDialog({ kind: "enroll", member })}
              onDeleteFingerprint={(fingerprint) => setDialog({ kind: "delete-fingerprint", member, fingerprint })}
              onDeletePhone={(phone) => setDialog({ kind: "delete-phone", member, phone })}
              onDelete={() => setDialog({ kind: "delete-member", member })}
            />
          ))}
        </div>
      )}

      {dialog?.kind === "add" && (
        <AddMemberDialog
          onClose={closeDialog}
          onCreated={(member) => {
            setNotice({ tone: "success", text: `${member.name} added — now set a PIN or add a fingerprint` });
            setDialog(null);
            void reload();
          }}
        />
      )}

      {dialog?.kind === "pin" && (
        <PinPadDialog
          member={dialog.member}
          onClose={closeDialog}
          onSaved={(member) => {
            setNotice({ tone: "success", text: `PIN saved for ${member.name}` });
            setDialog(null);
            void reload();
          }}
        />
      )}

      {dialog?.kind === "enroll" && (
        <EnrollFingerprintDialog
          member={dialog.member}
          doorOnline={doorOnline}
          onClose={() => {
            setDialog(null);
            void reload();
          }}
        />
      )}

      {dialog?.kind === "delete-member" && (
        <ConfirmDialog
          title={`Delete ${dialog.member.name}?`}
          detail="Their PIN stops working and their fingerprints are wiped from the sensor."
          busy={deleting}
          onCancel={closeDialog}
          onConfirmed={() => void confirmDelete()}
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
