using Microsoft.AspNetCore.Mvc;
using SmartDoor.Api.Contracts;
using SmartDoor.Api.Services;

namespace SmartDoor.Api.Controllers;

// The one door PIN everyone uses. Admin only.
[ApiController]
[Route("api/door-pin")]
public class DoorPinController(IDoorPinService doorPinService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<DoorPinResponse>> GetAsync(CancellationToken cancellationToken) =>
        Ok(DoorPinResponse.From(await doorPinService.GetAsync(cancellationToken)));

    [HttpPut]
    public async Task<ActionResult<DoorPinResponse>> SetAsync(
        [FromBody] SetDoorPinRequest request,
        CancellationToken cancellationToken)
    {
        var result = await doorPinService.SetAsync(request.Pin, cancellationToken);
        return this.ToActionResult(result, settings => Ok(DoorPinResponse.From(settings)));
    }

    [HttpDelete]
    public async Task<ActionResult<DoorPinResponse>> ClearAsync(CancellationToken cancellationToken) =>
        Ok(DoorPinResponse.From(await doorPinService.ClearAsync(cancellationToken)));
}
