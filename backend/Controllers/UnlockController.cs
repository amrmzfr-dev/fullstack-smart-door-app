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
    IPhoneKeyService phoneKeyService) : ControllerBase
{
    [HttpGet("status")]
    public async Task<ActionResult<UnlockStatusResponse>> GetStatusAsync() =>
        Ok(new UnlockStatusResponse(await doorAccessService.IsDoorOnlineAsync()));

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
    [HttpGet("{id:guid}")]
    public async Task<ActionResult<UnlockProgressResponse>> GetAsync(Guid id, CancellationToken cancellationToken)
    {
        var result = await doorAccessService.GetUnlockAsync(id, cancellationToken);
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
