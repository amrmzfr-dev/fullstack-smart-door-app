using Microsoft.AspNetCore.Mvc;
using SmartDoor.Api.Contracts;
using SmartDoor.Api.Services;

namespace SmartDoor.Api.Controllers;

// A door's weekly open hours (unlocked from..until on the chosen days). Admin only.
[ApiController]
[Route("api/doors/{doorId:guid}/schedule")]
public class DoorScheduleController(IDoorService doorService, IDoorStatusStore doorStatusStore) : ControllerBase
{
    [HttpPut]
    public async Task<ActionResult<DoorResponse>> UpdateAsync(
        Guid doorId,
        [FromBody] UpdateDoorScheduleRequest request,
        CancellationToken cancellationToken)
    {
        var result = await doorService.UpdateScheduleAsync(doorId, request, cancellationToken);
        if (result.Status != ServiceStatus.Ok)
        {
            return this.ToActionResult(result, _ => Ok());
        }

        var door = result.Value!;
        return Ok(DoorResponse.From(door, await doorStatusStore.GetAsync(door.Id), await doorStatusStore.IsOnlineAsync(door.Id)));
    }
}
