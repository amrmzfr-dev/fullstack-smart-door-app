using Microsoft.AspNetCore.Mvc;
using SmartDoor.Api.Contracts;
using SmartDoor.Api.Services;

namespace SmartDoor.Api.Controllers;

[ApiController]
[Route("api/commands")]
public class CommandsController(IDeviceCommandService commandService) : ControllerBase
{
    [HttpGet("{id:guid}")]
    public async Task<ActionResult<CommandResponse>> GetAsync(Guid id, CancellationToken cancellationToken)
    {
        var result = await commandService.GetAsync(id, cancellationToken);
        return this.ToActionResult(result, command => Ok(CommandResponse.From(command)));
    }

    [HttpPost("{id:guid}/cancel")]
    public async Task<ActionResult<CommandResponse>> CancelAsync(Guid id, CancellationToken cancellationToken)
    {
        var result = await commandService.CancelAsync(id, cancellationToken);
        return this.ToActionResult(result, command => Ok(CommandResponse.From(command)));
    }
}
