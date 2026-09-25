import { apiGet, apiPost } from "@/lib/api";
import {
  createPhoneCredential,
  getPhoneAssertion,
  guessDeviceLabel,
  type CreationOptionsJson,
  type RequestOptionsJson,
} from "@/lib/webauthn";
import type {
  CommandStatus,
  PhoneInviteInfo,
  PhoneSetupResult,
  UnlockProgress,
  PublicDoor,
  WebAuthnChallenge,
} from "@/types";

// Public keypad app — none of these need a login.

// Doors to pick from, each with the state its lock picture shows.
export function fetchPublicDoors(): Promise<PublicDoor[]> {
  return apiGet<PublicDoor[]>("/unlock/doors");
}

export function unlockWithPin(doorId: string, pin: string): Promise<UnlockProgress> {
  return apiPost<UnlockProgress>("/unlock/pin", { doorId, pin });
}

// While the unlock is waiting for the door ("pending") or just taken by it
// ("sent"), the server holds the reply until that changes — so the app hears
// the moment the door takes the unlock instead of on its next poll.
export function fetchUnlock(id: string, current?: CommandStatus): Promise<UnlockProgress> {
  const wait = current === "pending" || current === "sent" ? `?changedFrom=${current}` : "";
  return apiGet<UnlockProgress>(`/unlock/${id}${wait}`);
}

// Asks the phone for its fingerprint / face, then sends the signed answer.
export async function unlockWithPhone(doorId: string): Promise<UnlockProgress> {
  const challenge = await apiPost<WebAuthnChallenge<RequestOptionsJson>>("/unlock/phone/options", { doorId });
  const credential = await getPhoneAssertion(challenge.options);
  return apiPost<UnlockProgress>("/unlock/phone", { flowId: challenge.flowId, doorId, credential });
}

// ---- Phone setup through a one-time link (opened on the person's phone) ----

export function fetchPhoneInvite(token: string): Promise<PhoneInviteInfo> {
  return apiGet<PhoneInviteInfo>(`/phone-setup/${encodeURIComponent(token)}`);
}

// Asks the phone for its fingerprint once; after this the phone's own
// fingerprint opens the door from the keypad app.
export async function setUpPhone(token: string): Promise<PhoneSetupResult> {
  const path = `/phone-setup/${encodeURIComponent(token)}`;
  const challenge = await apiPost<WebAuthnChallenge<CreationOptionsJson>>(`${path}/options`);
  const credential = await createPhoneCredential(challenge.options);
  return apiPost<PhoneSetupResult>(path, {
    flowId: challenge.flowId,
    label: guessDeviceLabel(),
    credential,
  });
}
