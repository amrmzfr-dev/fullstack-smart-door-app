import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import type { AccessEvent, DeviceCommand, Door, DoorSetup, Member, PhoneInvite } from "@/types";

// ---- Doors ----

export function fetchDoors(): Promise<Door[]> {
  return apiGet<Door[]>("/doors");
}

// Returns the new door's controller settings — its key is shown only now.
export function createDoor(name: string): Promise<DoorSetup> {
  return apiPost<DoorSetup>("/doors", { name });
}

export function renameDoor(id: string, name: string): Promise<Door> {
  return apiPut<Door>(`/doors/${id}`, { name });
}

// New key for the door's controller (setting one up, or a lost/leaked key).
export function resetDoorKey(id: string): Promise<DoorSetup> {
  return apiPost<DoorSetup>(`/doors/${id}/key`);
}

export function deleteDoor(id: string): Promise<void> {
  return apiDelete(`/doors/${id}`);
}

// ---- Door PIN (one per door, for everyone at that door) ----

export function setDoorPin(doorId: string, pin: string): Promise<Door> {
  return apiPut<Door>(`/doors/${doorId}/pin`, { pin });
}

export function clearDoorPin(doorId: string): Promise<Door> {
  return apiDelete<Door>(`/doors/${doorId}/pin`);
}

// ---- Log ----

export function fetchEvents(limit = 200): Promise<AccessEvent[]> {
  return apiGet<AccessEvent[]>(`/events?limit=${limit}`);
}

// ---- People ----

export function fetchMembers(): Promise<Member[]> {
  return apiGet<Member[]>("/members");
}

export function createMember(name: string): Promise<Member> {
  return apiPost<Member>("/members", { name });
}

export function updateMember(id: string, name: string, enabled: boolean): Promise<Member> {
  return apiPut<Member>(`/members/${id}`, { name, enabled });
}

// Which doors this person may open (the whole set).
export function setMemberDoors(id: string, doorIds: string[]): Promise<Member> {
  return apiPut<Member>(`/members/${id}/doors`, { doorIds });
}

export function deleteMember(id: string): Promise<void> {
  return apiDelete(`/members/${id}`);
}

// ---- Fingerprints (on a door's own sensor) ----

export function startEnrollment(memberId: string, doorId: string, label: string): Promise<DeviceCommand> {
  return apiPost<DeviceCommand>(`/members/${memberId}/fingerprints`, { label, doorId });
}

export function deleteFingerprint(id: string): Promise<void> {
  return apiDelete(`/fingerprints/${id}`);
}

// ---- Phones (fingerprint unlock) ----

export function deletePhoneKey(id: string): Promise<void> {
  return apiDelete(`/phone-keys/${id}`);
}

// One-time link (15 min) for setting up fingerprint unlock on a person's phone.
export function createPhoneInvite(memberId: string): Promise<PhoneInvite> {
  return apiPost<PhoneInvite>("/phone-setup/invites", { memberId });
}

// ---- Commands ----

export function fetchCommand(id: string): Promise<DeviceCommand> {
  return apiGet<DeviceCommand>(`/commands/${id}`);
}

export function cancelCommand(id: string): Promise<DeviceCommand> {
  return apiPost<DeviceCommand>(`/commands/${id}/cancel`);
}
