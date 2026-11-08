import { apiGet, apiPost, apiPut } from "@/lib/api";
import { getPhoneLocation } from "@/lib/location";
import type { AccessEvent, CommandStatus, MemberDoor, MemberProfile, UnlockProgress } from "@/types";

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

// pin is only needed when the door is set to require it. When the door has a
// geofence, the phone's location is read first and sent along (the server
// checks it).
export async function unlockMyDoor(
  door: Pick<MemberDoor, "id" | "geofenceEnabled">,
  pin?: string,
): Promise<UnlockProgress> {
  const location = door.geofenceEnabled ? await getPhoneLocation() : null;
  return apiPost<UnlockProgress>("/member/unlock", {
    doorId: door.id,
    pin,
    latitude: location?.latitude,
    longitude: location?.longitude,
    accuracyMeters: location?.accuracyMeters,
  });
}

// Held by the server until the status moves on (same as the keypad app).
export function fetchMyUnlock(id: string, current?: CommandStatus): Promise<UnlockProgress> {
  const wait = current === "pending" || current === "sent" ? `?changedFrom=${current}` : "";
  return apiGet<UnlockProgress>(`/member/unlock/${id}${wait}`);
}
