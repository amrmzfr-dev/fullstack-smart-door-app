using Microsoft.AspNetCore.Mvc;
using SmartDoor.Api.Contracts;
using SmartDoor.Api.Services;

namespace SmartDoor.Api.Controllers;

// Whether a signed-in person has to type this door's PIN to open it from
// their account. Admin only.
[ApiController]
[Route("api/doors/{doorId:guid}/security")]
public class DoorSecurityController(IDoorService doorService, IDoorStatusStore doorStatusStore) : ControllerBase
{
    [HttpPut]
    public async Task<ActionResult<DoorResponse>> UpdateAsync(
        Guid doorId,
        [FromBody] UpdateDoorSecurityRequest request,
        CancellationToken cancellationToken)
    {
        var result = await doorService.UpdateSecurityAsync(doorId, request.PinRequired, cancellationToken);
        if (result.Status != ServiceStatus.Ok)
        {
            return this.ToActionResult(result, _ => Ok());
        }

        var door = result.Value!;
        return Ok(DoorResponse.From(door, await doorStatusStore.GetAsync(door.Id), await doorStatusStore.IsOnlineAsync(door.Id)));
    }
}
