import { apiGet, apiPost, apiPut } from "@/lib/api";
import type { AccessEvent, CommandStatus, MemberProfile, UnlockProgress } from "@/types";

// A signed-in person's own account (the /account page).

export function fetchMyProfile(): Promise<MemberProfile> {
  return apiGet<MemberProfile>("/member/me");
}

export function fetchMyActivity(limit = 40): Promise<AccessEvent[]> {
  return apiGet<AccessEvent[]>(`/member/activity?limit=${limit}`);
}

export function changeMyPassword(currentPassword: string, newPassword: string): Promise<MemberProfile> {
  return apiPut<MemberProfile>("/member/password", { currentPassword, newPassword });
}

// pin is only needed when the door is set to require it.
export function unlockMyDoor(doorId: string, pin?: string): Promise<UnlockProgress> {
  return apiPost<UnlockProgress>("/member/unlock", { doorId, pin });
}

// Held by the server until the status moves on (same as the keypad app).
export function fetchMyUnlock(id: string, current?: CommandStatus): Promise<UnlockProgress> {
  const wait = current === "pending" || current === "sent" ? `?changedFrom=${current}` : "";
  return apiGet<UnlockProgress>(`/member/unlock/${id}${wait}`);
}
