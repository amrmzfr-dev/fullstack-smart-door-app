using Microsoft.AspNetCore.Mvc;
using SmartDoor.Api.Contracts;
using SmartDoor.Api.Models;
using SmartDoor.Api.Services;

namespace SmartDoor.Api.Controllers;

// The doors (one ESP32 controller each). Admin only.
[ApiController]
[Route("api/doors")]
public class DoorsController(
    IDoorService doorService,
    IDoorStatusStore doorStatusStore,
    IConfiguration configuration) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<DoorResponse>>> ListAsync(CancellationToken cancellationToken)
    {
        var doors = await doorService.ListAsync(cancellationToken);
        var responses = new List<DoorResponse>(doors.Count);
        foreach (var door in doors)
        {
            responses.Add(await ToResponseAsync(door));
        }

        return Ok(responses);
    }

    // Returns the new door's firmware settings — the key is shown only now.
    [HttpPost]
    public async Task<ActionResult<DoorSetupResponse>> CreateAsync(
        [FromBody] CreateDoorRequest request,
        CancellationToken cancellationToken)
    {
        var result = await doorService.CreateAsync(request.Name, cancellationToken);
        if (result.Status != ServiceStatus.Ok)
        {
            return this.ToActionResult(result, _ => Ok());
        }

        return Ok(await ToSetupResponseAsync(result.Value!));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<DoorResponse>> RenameAsync(
        Guid id,
        [FromBody] RenameDoorRequest request,
        CancellationToken cancellationToken)
    {
        var result = await doorService.RenameAsync(id, request.Name, cancellationToken);
        if (result.Status != ServiceStatus.Ok)
        {
            return this.ToActionResult(result, _ => Ok());
        }

        return Ok(await ToResponseAsync(result.Value!));
    }

    // New key for a door (lost / leaked). Its controller must be re-flashed
    // with the new key before it can connect again.
    [HttpPost("{id:guid}/key")]
    public async Task<ActionResult<DoorSetupResponse>> ResetKeyAsync(Guid id, CancellationToken cancellationToken)
    {
        var result = await doorService.ResetKeyAsync(id, cancellationToken);
        if (result.Status != ServiceStatus.Ok)
        {
            return this.ToActionResult(result, _ => Ok());
        }

        return Ok(await ToSetupResponseAsync(result.Value!));
    }

    [HttpDelete("{id:guid}")]
    public async Task<ActionResult> DeleteAsync(Guid id, CancellationToken cancellationToken)
    {
        var result = await doorService.DeleteAsync(id, cancellationToken);
        return this.ToActionResult(result, _ => NoContent());
    }

    private async Task<DoorResponse> ToResponseAsync(Door door) =>
        DoorResponse.From(door, await doorStatusStore.GetAsync(door.Id), await doorStatusStore.IsOnlineAsync(door.Id));

    private async Task<DoorSetupResponse> ToSetupResponseAsync(CreatedDoor created) =>
        new(
            await ToResponseAsync(created.Door),
            created.DeviceKey,
            configuration["Mqtt:PublicHost"],
            configuration.GetValue<int?>("Mqtt:PublicPort"),
            configuration["Mqtt:DoorPassword"]);
}
