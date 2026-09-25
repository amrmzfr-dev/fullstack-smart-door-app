using Microsoft.AspNetCore.Mvc;
using SmartDoor.Api.Contracts;
using SmartDoor.Api.Services;

namespace SmartDoor.Api.Controllers;

[ApiController]
[Route("api")]
public class FingerprintsController(IFingerprintService fingerprintService) : ControllerBase
{
    // Starts enrollment on the door's sensor. Returns the command to poll
    // (GET /api/commands/{id}) for the live "place finger / lift / again" steps.
    [HttpPost("members/{memberId:guid}/fingerprints")]
    public async Task<ActionResult<CommandResponse>> EnrollAsync(
        Guid memberId,
        [FromBody] EnrollFingerprintRequest request,
        CancellationToken cancellationToken)
    {
        var result = await fingerprintService.StartEnrollmentAsync(
            memberId,
            request.DoorId,
            request.Label,
            this.CurrentUsername(),
            cancellationToken);
        return this.ToActionResult(result, command => Accepted(CommandResponse.From(command)));
    }

    [HttpDelete("fingerprints/{id:guid}")]
    public async Task<ActionResult> DeleteAsync(Guid id, CancellationToken cancellationToken)
    {
        var result = await fingerprintService.DeleteAsync(id, this.CurrentUsername(), cancellationToken);
        return this.ToActionResult(result, _ => NoContent());
    }
}
