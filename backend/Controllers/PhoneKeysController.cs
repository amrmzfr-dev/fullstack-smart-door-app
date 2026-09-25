using Microsoft.AspNetCore.Mvc;
using SmartDoor.Api.Contracts;
using SmartDoor.Api.Services;

namespace SmartDoor.Api.Controllers;

// Phones registered for fingerprint unlock. Admin only: the admin signs in on
// the person's phone and sets it up for them.
[ApiController]
[Route("api/phone-keys")]
public class PhoneKeysController(IPhoneKeyService phoneKeyService) : ControllerBase
{
    [HttpPost("setup/options")]
    public async Task<ActionResult<WebAuthnChallengeResponse>> StartSetupAsync(
        [FromBody] StartPhoneSetupRequest request,
        CancellationToken cancellationToken)
    {
        var result = await phoneKeyService.StartSetupAsync(request.MemberId, cancellationToken);
        return this.ToActionResult(result, challenge => Ok(UnlockController.ToResponse(challenge)));
    }

    [HttpPost("setup")]
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
