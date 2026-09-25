using System.Text.Json;
using SmartDoor.Api.Models;

namespace SmartDoor.Api.Services;

// FlowId ties the browser's answer back to the challenge we sent; OptionsJson
// is the WebAuthn JSON for navigator.credentials.create / get.
public sealed record WebAuthnChallenge(Guid FlowId, string OptionsJson);

// Phone fingerprint / face unlock (WebAuthn passkeys). Setting one up needs
// the person's PIN once; after that the phone's own fingerprint is enough.
public interface IPhoneKeyService
{
    Task<ServiceResult<WebAuthnChallenge>> StartSetupAsync(string pin, CancellationToken cancellationToken);
    Task<ServiceResult<PhoneKey>> FinishSetupAsync(
        Guid flowId,
        string? label,
        JsonElement credential,
        CancellationToken cancellationToken);

    Task<ServiceResult<WebAuthnChallenge>> StartUnlockAsync(CancellationToken cancellationToken);

    // Returns the member the phone belongs to once the signature checks out.
    Task<ServiceResult<Member>> FinishUnlockAsync(Guid flowId, JsonElement credential, CancellationToken cancellationToken);

    Task<ServiceResult<bool>> DeleteAsync(Guid id, CancellationToken cancellationToken);
}
