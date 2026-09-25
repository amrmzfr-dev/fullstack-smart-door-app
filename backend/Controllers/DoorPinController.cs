using Microsoft.AspNetCore.Mvc;
using SmartDoor.Api.Contracts;
using SmartDoor.Api.Services;

namespace SmartDoor.Api.Controllers;

// Each door's PIN (one for everyone at that door). Admin only.
[ApiController]
[Route("api/doors/{doorId:guid}/pin")]
public class DoorPinController(IDoorPinService doorPinService, IDoorStatusStore doorStatusStore) : ControllerBase
{
    [HttpPut]
    public async Task<ActionResult<DoorResponse>> SetAsync(
        Guid doorId,
        [FromBody] SetDoorPinRequest request,
        CancellationToken cancellationToken)
    {
        var result = await doorPinService.SetAsync(doorId, request.Pin, cancellationToken);
        if (result.Status != ServiceStatus.Ok)
        {
            return this.ToActionResult(result, _ => Ok());
        }

        return Ok(DoorResponse.From(
            result.Value!,
            await doorStatusStore.GetAsync(doorId),
            await doorStatusStore.IsOnlineAsync(doorId)));
    }

    [HttpDelete]
    public async Task<ActionResult<DoorResponse>> ClearAsync(Guid doorId, CancellationToken cancellationToken)
    {
        var result = await doorPinService.ClearAsync(doorId, cancellationToken);
        if (result.Status != ServiceStatus.Ok)
        {
            return this.ToActionResult(result, _ => Ok());
        }

        return Ok(DoorResponse.From(
            result.Value!,
            await doorStatusStore.GetAsync(doorId),
            await doorStatusStore.IsOnlineAsync(doorId)));
    }
}
