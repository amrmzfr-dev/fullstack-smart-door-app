using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using SmartDoor.Api.Contracts;
using SmartDoor.Api.Services;

namespace SmartDoor.Api.Controllers;

// Phones registered for fingerprint unlock. Setting one up happens on the
// public keypad app (the person's PIN proves who they are); removing one is
// an admin job.
[ApiController]
[Route("api/phone-keys")]
public class PhoneKeysController(IPhoneKeyService phoneKeyService) : ControllerBase
{
    [HttpPost("setup/options")]
    [AllowAnonymous]
    [EnableRateLimiting(RateLimits.PinAttempts)]
    public async Task<ActionResult<WebAuthnChallengeResponse>> StartSetupAsync(
        [FromBody] StartPhoneSetupRequest request,
        CancellationToken cancellationToken)
    {
        var result = await phoneKeyService.StartSetupAsync(request.Pin, cancellationToken);
        return this.ToActionResult(result, challenge => Ok(UnlockController.ToResponse(challenge)));
    }

    [HttpPost("setup")]
    [AllowAnonymous]
    public async Task<ActionResult<PhoneSetupResponse>> FinishSetupAsync(
        [FromBody] FinishPhoneSetupRequest request,
        CancellationToken cancellationToken)
    {
        var result = await phoneKeyService.FinishSetupAsync(
            request.FlowId,
            request.Label,
            request.Credential,
            cancellationToken);
        return this.ToActionResult(result, key => Ok(new PhoneSetupResponse(key.Id, key.Label)));
    }

    [HttpDelete("{id:guid}")]
    public async Task<ActionResult> DeleteAsync(Guid id, CancellationToken cancellationToken)
    {
        var result = await phoneKeyService.DeleteAsync(id, cancellationToken);
        return this.ToActionResult(result, _ => NoContent());
    }
}
