using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartDoor.Api.Contracts;
using SmartDoor.Api.Filters;
using SmartDoor.Api.Models;
using SmartDoor.Api.Services;

namespace SmartDoor.Api.Controllers;

// Endpoints called by door controllers (ESP32s) themselves, not the web app.
// The X-Device-Key says which door is calling; everything here is scoped to
// that door. Over MQTT the heartbeat isn't used — it's the fallback link.
[ApiController]
[Route("api/device")]
[AllowAnonymous]
[DeviceKey]
public class DeviceController(
    IDoorStatusStore doorStatusStore,
    IAccessListService accessListService,
    IDeviceCommandService commandService,
    IAccessEventService accessEventService) : ControllerBase
{
    [HttpPost("heartbeat")]
    public async Task<ActionResult<HeartbeatResponse>> HeartbeatAsync(
        [FromBody] HeartbeatRequest request,
        CancellationToken cancellationToken)
    {
        var door = DeviceKeyAttribute.GetDoor(HttpContext);
        await doorStatusStore.SaveAsync(door.Id, new DoorStatusSnapshot(
            request.DoorOpen,
            request.Locked,
            request.FingerprintReady,
            request.TemplateCount,
            request.FirmwareVersion,
            request.IpAddress ?? HttpContext.Connection.RemoteIpAddress?.ToString(),
            request.Rssi,
            request.UptimeMs,
            DateTimeOffset.UtcNow));

        var accessList = await accessListService.BuildAsync(door.Id, cancellationToken);
        var commands = await commandService.TakePendingForDeviceAsync(door.Id, cancellationToken);

        return Ok(new HeartbeatResponse(
            accessList.Version,
            commands.Select(DeviceCommandDto.From).ToList()));
    }

    [HttpGet("access-list")]
    public async Task<ActionResult<AccessList>> GetAccessListAsync(CancellationToken cancellationToken) =>
        Ok(await accessListService.BuildAsync(DeviceKeyAttribute.GetDoor(HttpContext).Id, cancellationToken));

    [HttpPost("events")]
    public async Task<ActionResult> PostEventsAsync(
        [FromBody] DeviceEventBatch batch,
        CancellationToken cancellationToken)
    {
        await accessEventService.RecordDeviceEventsAsync(DeviceKeyAttribute.GetDoor(HttpContext), batch.Events, cancellationToken);
        return NoContent();
    }

    [HttpPost("commands/{id:guid}")]
    public async Task<ActionResult> UpdateCommandAsync(
        Guid id,
        [FromBody] DeviceCommandUpdate update,
        CancellationToken cancellationToken)
    {
        var result = await commandService.ApplyDeviceUpdateAsync(
            DeviceKeyAttribute.GetDoor(HttpContext).Id,
            id,
            update,
            cancellationToken);
        return this.ToActionResult(result, _ => NoContent());
    }
}
