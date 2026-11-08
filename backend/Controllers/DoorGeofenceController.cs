using Microsoft.AspNetCore.Mvc;
using SmartDoor.Api.Contracts;
using SmartDoor.Api.Services;

namespace SmartDoor.Api.Controllers;

// The circle around a door that a phone must be inside to unlock it from a
// signed-in account. Admin only.
[ApiController]
[Route("api/doors/{doorId:guid}/geofence")]
public class DoorGeofenceController(IDoorService doorService, IDoorStatusStore doorStatusStore) : ControllerBase
{
    [HttpPut]
    public async Task<ActionResult<DoorResponse>> UpdateAsync(
        Guid doorId,
        [FromBody] UpdateDoorGeofenceRequest request,
        CancellationToken cancellationToken)
    {
        var result = await doorService.UpdateGeofenceAsync(doorId, request, cancellationToken);
        if (result.Status != ServiceStatus.Ok)
        {
            return this.ToActionResult(result, _ => Ok());
        }

        var door = result.Value!;
        return Ok(DoorResponse.From(door, await doorStatusStore.GetAsync(door.Id), await doorStatusStore.IsOnlineAsync(door.Id)));
    }
}
