import { apiGet, apiPost } from "@/lib/api";
import {
  createPhoneCredential,
  getPhoneAssertion,
  guessDeviceLabel,
  type CreationOptionsJson,
  type RequestOptionsJson,
} from "@/lib/webauthn";
import type { PhoneSetupResult, UnlockProgress, UnlockStatus, WebAuthnChallenge } from "@/types";

// Public keypad app — none of these need a login.

export function fetchUnlockStatus(): Promise<UnlockStatus> {
  return apiGet<UnlockStatus>("/unlock/status");
}

export function unlockWithPin(pin: string): Promise<UnlockProgress> {
  return apiPost<UnlockProgress>("/unlock/pin", { pin });
}

export function fetchUnlock(id: string): Promise<UnlockProgress> {
  return apiGet<UnlockProgress>(`/unlock/${id}`);
}

// Asks the phone for its fingerprint / face, then sends the signed answer.
export async function unlockWithPhone(): Promise<UnlockProgress> {
  const challenge = await apiPost<WebAuthnChallenge<RequestOptionsJson>>("/unlock/phone/options");
  const credential = await getPhoneAssertion(challenge.options);
  return apiPost<UnlockProgress>("/unlock/phone", { flowId: challenge.flowId, credential });
}

// The PIN proves who's holding the phone; after this the phone's own
// fingerprint is enough.
export async function setUpPhone(pin: string): Promise<PhoneSetupResult> {
  const challenge = await apiPost<WebAuthnChallenge<CreationOptionsJson>>("/phone-keys/setup/options", { pin });
  const credential = await createPhoneCredential(challenge.options);
  return apiPost<PhoneSetupResult>("/phone-keys/setup", {
    flowId: challenge.flowId,
    label: guessDeviceLabel(),
    credential,
  });
}
