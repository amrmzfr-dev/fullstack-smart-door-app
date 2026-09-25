using Microsoft.AspNetCore.Mvc;
using SmartDoor.Api.Contracts;
using SmartDoor.Api.Services;

namespace SmartDoor.Api.Controllers;

[ApiController]
[Route("api/door")]
public class DoorController(IDoorStatusStore doorStatusStore) : ControllerBase
{
    [HttpGet("status")]
    public async Task<ActionResult<DoorStatusResponse>> GetStatusAsync()
    {
        var snapshot = await doorStatusStore.GetAsync();
        if (snapshot is null)
        {
            return Ok(new DoorStatusResponse(false, null, null, null, null, null, null, null, null));
        }

        var online = DateTimeOffset.UtcNow - snapshot.LastSeenAt <= RedisDoorStatusStore.OnlineWindow;
        return Ok(new DoorStatusResponse(
            online,
            snapshot.LastSeenAt,
            snapshot.DoorOpen,
            snapshot.Locked,
            snapshot.FingerprintReady,
            snapshot.TemplateCount,
            snapshot.FirmwareVersion,
            snapshot.IpAddress,
            snapshot.Rssi));
    }
}
