// Phone fingerprint / face unlock through WebAuthn (passkeys). The backend
// sends options as JSON with binary fields in base64url; the browser API wants
// ArrayBuffers, and the answer goes back the other way.

interface CredentialDescriptorJson {
  type: "public-key";
  id: string;
  transports?: AuthenticatorTransport[] | null;
}

export interface CreationOptionsJson {
  rp: { id?: string | null; name: string };
  user: { id: string; name: string; displayName: string };
  challenge: string;
  pubKeyCredParams: PublicKeyCredentialParameters[];
  timeout?: number | null;
  attestation?: AttestationConveyancePreference | null;
  authenticatorSelection?: AuthenticatorSelectionCriteria | null;
  excludeCredentials?: CredentialDescriptorJson[] | null;
}

export interface RequestOptionsJson {
  challenge: string;
  timeout?: number | null;
  rpId?: string | null;
  allowCredentials?: CredentialDescriptorJson[] | null;
  userVerification?: UserVerificationRequirement | null;
}

function toBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function toBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function toDescriptors(list: CredentialDescriptorJson[] | null | undefined): PublicKeyCredentialDescriptor[] {
  return (list ?? []).map((item) => ({
    type: item.type,
    id: toBuffer(item.id),
    ...(item.transports ? { transports: item.transports } : {}),
  }));
}

// Fields are copied one by one (never spread) because the backend may send
// nulls, and the browser rejects null where it expects a list.
function toCreationOptions(json: CreationOptionsJson): PublicKeyCredentialCreationOptions {
  return {
    rp: { name: json.rp.name, ...(json.rp.id ? { id: json.rp.id } : {}) },
    user: { id: toBuffer(json.user.id), name: json.user.name, displayName: json.user.displayName },
    challenge: toBuffer(json.challenge),
    pubKeyCredParams: json.pubKeyCredParams,
    excludeCredentials: toDescriptors(json.excludeCredentials),
    ...(json.timeout ? { timeout: json.timeout } : {}),
    ...(json.attestation ? { attestation: json.attestation } : {}),
    ...(json.authenticatorSelection ? { authenticatorSelection: json.authenticatorSelection } : {}),
  };
}

function toRequestOptions(json: RequestOptionsJson): PublicKeyCredentialRequestOptions {
  return {
    challenge: toBuffer(json.challenge),
    allowCredentials: toDescriptors(json.allowCredentials),
    ...(json.timeout ? { timeout: json.timeout } : {}),
    ...(json.rpId ? { rpId: json.rpId } : {}),
    ...(json.userVerification ? { userVerification: json.userVerification } : {}),
  };
}

// Needs HTTPS (or localhost) and a browser that knows passkeys.
export function isPhoneUnlockSupported(): boolean {
  return window.isSecureContext && typeof window.PublicKeyCredential !== "undefined";
}

export async function createPhoneCredential(options: CreationOptionsJson): Promise<unknown> {
  const credential = await navigator.credentials.create({ publicKey: toCreationOptions(options) });
  if (!(credential instanceof PublicKeyCredential)) throw new Error("No credential returned");
  const response = credential.response as AuthenticatorAttestationResponse;
  return {
    id: credential.id,
    rawId: toBase64url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: toBase64url(response.clientDataJSON),
      attestationObject: toBase64url(response.attestationObject),
      transports: response.getTransports(),
    },
    clientExtensionResults: {},
  };
}

export async function getPhoneAssertion(options: RequestOptionsJson): Promise<unknown> {
  const credential = await navigator.credentials.get({ publicKey: toRequestOptions(options) });
  if (!(credential instanceof PublicKeyCredential)) throw new Error("No credential returned");
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    rawId: toBase64url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: toBase64url(response.clientDataJSON),
      authenticatorData: toBase64url(response.authenticatorData),
      signature: toBase64url(response.signature),
      userHandle: response.userHandle ? toBase64url(response.userHandle) : null,
    },
    clientExtensionResults: {},
  };
}

// The person closed the prompt / let it time out — not worth an error.
export function isCancelled(error: unknown): boolean {
  return error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "AbortError");
}

// A readable name for the admin's "Phones" list.
export function guessDeviceLabel(): string {
  const agent = navigator.userAgent;
  if (/iPhone/i.test(agent)) return "iPhone";
  if (/iPad/i.test(agent)) return "iPad";
  if (/Android/i.test(agent)) return /Mobile/i.test(agent) ? "Android phone" : "Android tablet";
  if (/Macintosh/i.test(agent)) return "Mac";
  if (/Windows/i.test(agent)) return "Windows PC";
  return "Phone";
}

// True when this device has a built-in fingerprint / face reader set up.
export async function hasPhoneFingerprint(): Promise<boolean> {
  if (!isPhoneUnlockSupported()) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}
