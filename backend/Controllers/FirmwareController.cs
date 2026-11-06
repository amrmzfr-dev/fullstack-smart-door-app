using Microsoft.AspNetCore.Mvc;
using SmartDoor.Api.Contracts;
using SmartDoor.Api.Services;

namespace SmartDoor.Api.Controllers;

// Door firmware for over-the-air updates. Admin only (login required).
// Upload the file, then tell a door to install it.
[ApiController]
[Route("api/firmware")]
public class FirmwareController(
    IFirmwareStore firmwareStore,
    IDeviceCommandService commandService) : ControllerBase
{
    [HttpGet]
    public ActionResult<IReadOnlyList<FirmwareResponse>> List() =>
        Ok(firmwareStore.List().Select(FirmwareResponse.From).ToList());

    // Body = the raw .bin file (PlatformIO: .pio/build/esp32dev/firmware.bin).
    // Send it with Content-Type: application/octet-stream — curl's default
    // (form data) makes ASP.NET try to parse the file as a form and fail.
    // curl -X PUT -H "Authorization: Bearer <token>" -H "Content-Type: application/octet-stream" --data-binary @firmware.bin <api>/firmware/<version>
    [HttpPut("{version}")]
    [Consumes("application/octet-stream")]
    [RequestSizeLimit(FirmwareStore.MaxBytes)]
    public async Task<ActionResult<FirmwareResponse>> UploadAsync(string version, CancellationToken cancellationToken)
    {
        if (!firmwareStore.IsValidVersion(version))
        {
            return BadRequest("Version may only use letters, digits, '.', '-' and '_' (max 15 characters).");
        }

        try
        {
            var file = await firmwareStore.SaveAsync(version, Request.Body, cancellationToken);
            return Ok(FirmwareResponse.From(file));
        }
        catch (InvalidDataException ex)
        {
            return BadRequest(ex.Message);
        }
    }

    // Starts the update. Follow it with GET api/commands/{id}.
    [HttpPost("{version}/install")]
    public async Task<ActionResult<CommandResponse>> InstallAsync(
        string version,
        [FromBody] InstallFirmwareRequest request,
        CancellationToken cancellationToken)
    {
        var result = await commandService.QueueFirmwareUpdateAsync(
            request.DoorId,
            version,
            this.CurrentUsername(),
            cancellationToken);
        return this.ToActionResult(result, command => Accepted(CommandResponse.From(command)));
    }
}
