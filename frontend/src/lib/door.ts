import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import type { AccessEvent, DeviceCommand, DoorStatus, Member } from "@/types";

// ---- Door ----

export function fetchDoorStatus(): Promise<DoorStatus> {
  return apiGet<DoorStatus>("/door/status");
}

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

export function setMemberPin(id: string, pin: string): Promise<Member> {
  return apiPut<Member>(`/members/${id}/pin`, { pin });
}

export function clearMemberPin(id: string): Promise<Member> {
  return apiDelete<Member>(`/members/${id}/pin`);
}

export function deleteMember(id: string): Promise<void> {
  return apiDelete(`/members/${id}`);
}

// ---- Fingerprints ----

export function startEnrollment(memberId: string, label: string): Promise<DeviceCommand> {
  return apiPost<DeviceCommand>(`/members/${memberId}/fingerprints`, { label });
}

export function deleteFingerprint(id: string): Promise<void> {
  return apiDelete(`/fingerprints/${id}`);
}

// ---- Phones (fingerprint unlock) ----

export function deletePhoneKey(id: string): Promise<void> {
  return apiDelete(`/phone-keys/${id}`);
}

// ---- Commands ----

export function fetchCommand(id: string): Promise<DeviceCommand> {
  return apiGet<DeviceCommand>(`/commands/${id}`);
}

export function cancelCommand(id: string): Promise<DeviceCommand> {
  return apiPost<DeviceCommand>(`/commands/${id}/cancel`);
}
