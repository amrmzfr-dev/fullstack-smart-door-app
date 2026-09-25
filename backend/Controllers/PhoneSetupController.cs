using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using SmartDoor.Api.Contracts;
using SmartDoor.Api.Services;

namespace SmartDoor.Api.Controllers;

// Setting up fingerprint unlock on a person's own phone. The admin creates a
// one-time link; the person opens it on their phone (no login) and scans.
[ApiController]
[Route("api/phone-setup")]
public class PhoneSetupController(
    IPhoneInviteService inviteService,
    IPhoneKeyService phoneKeyService) : ControllerBase
{
    // Admin only.
    [HttpPost("invites")]
    public async Task<ActionResult<PhoneInviteResponse>> CreateInviteAsync(
        [FromBody] CreatePhoneInviteRequest request,
        CancellationToken cancellationToken)
    {
        var result = await inviteService.CreateAsync(request.MemberId, cancellationToken);
        return this.ToActionResult(result, invite => Ok(new PhoneInviteResponse(invite.Token, invite.ExpiresAt)));
    }

    // "Set up fingerprint for <name>" on the phone.
    [HttpGet("{token}")]
    [AllowAnonymous]
    public async Task<ActionResult<PhoneInviteInfoResponse>> GetInviteAsync(string token)
    {
        var result = await inviteService.GetAsync(token);
        return this.ToActionResult(result, invite => Ok(new PhoneInviteInfoResponse(invite.MemberName, invite.ExpiresAt)));
    }

    [HttpPost("{token}/options")]
    [AllowAnonymous]
    [EnableRateLimiting(RateLimits.PinAttempts)]
    public async Task<ActionResult<WebAuthnChallengeResponse>> StartAsync(string token, CancellationToken cancellationToken)
    {
        var invite = await inviteService.GetAsync(token);
        if (invite.Status != ServiceStatus.Ok)
        {
            return this.ToActionResult(invite, _ => Ok());
        }

        var result = await phoneKeyService.StartSetupAsync(invite.Value!.MemberId, cancellationToken);
        return this.ToActionResult(result, challenge => Ok(UnlockController.ToResponse(challenge)));
    }

    [HttpPost("{token}")]
    [AllowAnonymous]
    public async Task<ActionResult<PhoneSetupResponse>> FinishAsync(
        string token,
        [FromBody] FinishPhoneSetupRequest request,
        CancellationToken cancellationToken)
    {
        var invite = await inviteService.GetAsync(token);
        if (invite.Status != ServiceStatus.Ok)
        {
            return this.ToActionResult(invite, _ => Ok());
        }

        var result = await phoneKeyService.FinishSetupAsync(
            request.FlowId,
            invite.Value!.MemberId,
            request.Label,
            request.Credential,
            cancellationToken);
        if (result.Status == ServiceStatus.Ok)
        {
            // Used up — the link can't register a second phone.
            await inviteService.RevokeAsync(token);
        }

        return this.ToActionResult(result, key => Ok(new PhoneSetupResponse(key.Id, key.Label)));
    }
}
