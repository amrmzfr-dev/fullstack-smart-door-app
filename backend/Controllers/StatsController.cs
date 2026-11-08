using Microsoft.AspNetCore.Mvc;
using SmartDoor.Api.Contracts;
using SmartDoor.Api.Services;

namespace SmartDoor.Api.Controllers;

// Numbers for the admin Overview tab. Admin only.
[ApiController]
[Route("api/stats")]
public class StatsController(IStatsService statsService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<StatsResponse>> GetAsync(
        [FromQuery] int utcOffsetMinutes = 480,
        CancellationToken cancellationToken = default) =>
        Ok(await statsService.GetAsync(utcOffsetMinutes, cancellationToken));
}
