using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using SmartDoor.Api.Contracts;
using SmartDoor.Api.Models;
using SmartDoor.Api.Services;

namespace SmartDoor.Api.Controllers;

// The public keypad app. No login: the PIN or the phone's fingerprint is the
// proof. Nothing here ever says who opened the door.
[ApiController]
[Route("api/unlock")]
[AllowAnonymous]
public class UnlockController(
    IDoorAccessService doorAccessService,
    IDoorStatusStore doorStatusStore,
    IPhoneKeyService phoneKeyService) : ControllerBase
{
    [HttpGet("status")]
    public async Task<ActionResult<UnlockStatusResponse>> GetStatusAsync()
    {
        var snapshot = await doorStatusStore.GetAsync();
        var online = snapshot is not null
                     && DateTimeOffset.UtcNow - snapshot.LastSeenAt <= RedisDoorStatusStore.OnlineWindow;
        return Ok(online
            ? new UnlockStatusResponse(true, snapshot!.DoorOpen, snapshot.Locked)
            : new UnlockStatusResponse(false, null, null));
    }

    [HttpPost("pin")]
    [EnableRateLimiting(RateLimits.PinAttempts)]
    public async Task<ActionResult<UnlockProgressResponse>> UnlockWithPinAsync(
        [FromBody] PinUnlockRequest request,
        CancellationToken cancellationToken)
    {
        var result = await doorAccessService.UnlockWithPinAsync(request.Pin, cancellationToken);
        return this.ToActionResult(result, command => Accepted(UnlockProgressResponse.From(command)));
    }

    // Poll after an unlock to learn whether the door actually opened.
    // With ?changedFrom=pending the reply is held (up to a few seconds) until
    // the status moves on, so the app hears the moment the door takes the
    // unlock instead of finding out on its next poll.
    [HttpGet("{id:guid}")]
    public async Task<ActionResult<UnlockProgressResponse>> GetAsync(
        Guid id,
        [FromQuery] CommandStatus? changedFrom,
        CancellationToken cancellationToken)
    {
        var result = changedFrom is CommandStatus status
            ? await doorAccessService.WaitForUnlockChangeAsync(id, status, cancellationToken)
            : await doorAccessService.GetUnlockAsync(id, cancellationToken);
        return this.ToActionResult(result, command => Ok(UnlockProgressResponse.From(command)));
    }

    [HttpPost("phone/options")]
    [EnableRateLimiting(RateLimits.PinAttempts)]
    public async Task<ActionResult<WebAuthnChallengeResponse>> StartPhoneUnlockAsync(CancellationToken cancellationToken)
    {
        var result = await phoneKeyService.StartUnlockAsync(cancellationToken);
        return this.ToActionResult(result, challenge => Ok(ToResponse(challenge)));
    }

    [HttpPost("phone")]
    public async Task<ActionResult<UnlockProgressResponse>> UnlockWithPhoneAsync(
        [FromBody] FinishPhoneUnlockRequest request,
        CancellationToken cancellationToken)
    {
        var verified = await phoneKeyService.FinishUnlockAsync(request.FlowId, request.Credential, cancellationToken);
        if (verified.Status != ServiceStatus.Ok)
        {
            return this.ToActionResult(verified, _ => Ok());
        }

        var result = await doorAccessService.UnlockForMemberAsync(
            verified.Value!,
            AccessMethod.PhoneFingerprint,
            cancellationToken);
        return this.ToActionResult(result, command => Accepted(UnlockProgressResponse.From(command)));
    }

    internal static WebAuthnChallengeResponse ToResponse(WebAuthnChallenge challenge)
    {
        using var document = JsonDocument.Parse(challenge.OptionsJson);
        return new WebAuthnChallengeResponse(challenge.FlowId, document.RootElement.Clone());
    }
}
