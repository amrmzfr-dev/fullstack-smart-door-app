using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartDoor.Api.Contracts;
using SmartDoor.Api.Filters;
using SmartDoor.Api.Models;
using SmartDoor.Api.Services;

namespace SmartDoor.Api.Controllers;

// Endpoints called by the door controller (ESP32) itself, not the web app.
// REST only — the door polls /heartbeat every couple of seconds and gets any
// waiting commands back in the reply.
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
        await doorStatusStore.SaveAsync(new DoorStatusSnapshot(
            request.DoorOpen,
            request.Locked,
            request.FingerprintReady,
            request.TemplateCount,
            request.FirmwareVersion,
            request.IpAddress ?? HttpContext.Connection.RemoteIpAddress?.ToString(),
            request.Rssi,
            request.UptimeMs,
            DateTimeOffset.UtcNow));

        var accessList = await accessListService.BuildAsync(cancellationToken);
        var commands = await commandService.TakePendingForDeviceAsync(cancellationToken);

        return Ok(new HeartbeatResponse(
            accessList.Version,
            commands.Select(DeviceCommandDto.From).ToList()));
    }

    [HttpGet("access-list")]
    public async Task<ActionResult<AccessList>> GetAccessListAsync(CancellationToken cancellationToken) =>
        Ok(await accessListService.BuildAsync(cancellationToken));

    [HttpPost("events")]
    public async Task<ActionResult> PostEventsAsync(
        [FromBody] DeviceEventBatch batch,
        CancellationToken cancellationToken)
    {
        await accessEventService.RecordDeviceEventsAsync(batch.Events, cancellationToken);
        return NoContent();
    }

    [HttpPost("commands/{id:guid}")]
    public async Task<ActionResult> UpdateCommandAsync(
        Guid id,
        [FromBody] DeviceCommandUpdate update,
        CancellationToken cancellationToken)
    {
        var result = await commandService.ApplyDeviceUpdateAsync(id, update, cancellationToken);
        return this.ToActionResult(result, _ => NoContent());
    }
}
