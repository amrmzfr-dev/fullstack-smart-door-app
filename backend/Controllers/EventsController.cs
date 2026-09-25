using Microsoft.AspNetCore.Mvc;
using SmartDoor.Api.Contracts;
using SmartDoor.Api.Services;

namespace SmartDoor.Api.Controllers;

[ApiController]
[Route("api/events")]
public class EventsController(IAccessEventService accessEventService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<AccessEventResponse>>> ListAsync(
        [FromQuery] int limit = 200,
        CancellationToken cancellationToken = default)
    {
        var events = await accessEventService.ListAsync(limit, cancellationToken);
        return Ok(events.Select(AccessEventResponse.From).ToList());
    }
}
