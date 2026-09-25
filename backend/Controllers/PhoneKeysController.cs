using Microsoft.AspNetCore.Mvc;
using SmartDoor.Api.Services;

namespace SmartDoor.Api.Controllers;

// Phones registered for fingerprint unlock. Admin only. Setting one up goes
// through a one-time link — see PhoneSetupController.
[ApiController]
[Route("api/phone-keys")]
public class PhoneKeysController(IPhoneKeyService phoneKeyService) : ControllerBase
{
    [HttpDelete("{id:guid}")]
    public async Task<ActionResult> DeleteAsync(Guid id, CancellationToken cancellationToken)
    {
        var result = await phoneKeyService.DeleteAsync(id, cancellationToken);
        return this.ToActionResult(result, _ => NoContent());
    }
}
