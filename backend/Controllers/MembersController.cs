using Microsoft.AspNetCore.Mvc;
using SmartDoor.Api.Contracts;
using SmartDoor.Api.Services;

namespace SmartDoor.Api.Controllers;

[ApiController]
[Route("api/members")]
public class MembersController(IMemberService memberService) : ControllerBase
{
    [HttpGet]
    public async Task<ActionResult<IReadOnlyList<MemberResponse>>> ListAsync(CancellationToken cancellationToken)
    {
        var members = await memberService.ListAsync(cancellationToken);
        return Ok(members.Select(MemberResponse.From).ToList());
    }

    [HttpPost]
    public async Task<ActionResult<MemberResponse>> CreateAsync(
        [FromBody] CreateMemberRequest request,
        CancellationToken cancellationToken)
    {
        var result = await memberService.CreateAsync(request.Name, request.Username, request.Password, cancellationToken);
        return this.ToActionResult(result, member => Ok(MemberResponse.From(member)));
    }

    [HttpPut("{id:guid}")]
    public async Task<ActionResult<MemberResponse>> UpdateAsync(
        Guid id,
        [FromBody] UpdateMemberRequest request,
        CancellationToken cancellationToken)
    {
        var result = await memberService.UpdateAsync(id, request.Name, request.Enabled, cancellationToken);
        return this.ToActionResult(result, member => Ok(MemberResponse.From(member)));
    }

    // Create or change the person's sign-in (a missing password keeps the old one).
    [HttpPut("{id:guid}/account")]
    public async Task<ActionResult<MemberResponse>> SetAccountAsync(
        Guid id,
        [FromBody] SetMemberAccountRequest request,
        CancellationToken cancellationToken)
    {
        var result = await memberService.SetAccountAsync(id, request.Username, request.Password, cancellationToken);
        return this.ToActionResult(result, member => Ok(MemberResponse.From(member)));
    }

    // Let the person open the admin panel from their account page (or take it away).
    [HttpPut("{id:guid}/admin")]
    public async Task<ActionResult<MemberResponse>> SetAdminAsync(
        Guid id,
        [FromBody] SetMemberAdminRequest request,
        CancellationToken cancellationToken)
    {
        // Nobody can take admin away from themselves (a person signed in with
        // admin access has their own member id as the token's subject).
        var callerId = User.FindFirst(System.IdentityModel.Tokens.Jwt.JwtRegisteredClaimNames.Sub)?.Value;
        if (!request.IsAdmin && callerId is not null && Guid.TryParse(callerId, out var caller) && caller == id)
        {
            return BadRequest("You can't take admin away from yourself. Ask another admin.");
        }

        var result = await memberService.SetAdminAsync(id, request.IsAdmin, cancellationToken);
        return this.ToActionResult(result, member => Ok(MemberResponse.From(member)));
    }

    [HttpDelete("{id:guid}/account")]
    public async Task<ActionResult<MemberResponse>> ClearAccountAsync(Guid id, CancellationToken cancellationToken)
    {
        var result = await memberService.ClearAccountAsync(id, cancellationToken);
        return this.ToActionResult(result, member => Ok(MemberResponse.From(member)));
    }

    // One person's own history, newest first.
    [HttpGet("{id:guid}/events")]
    public async Task<ActionResult<IReadOnlyList<AccessEventResponse>>> EventsAsync(
        Guid id,
        [FromServices] IAccessEventService accessEventService,
        [FromQuery] int limit = 100,
        CancellationToken cancellationToken = default)
    {
        var events = await accessEventService.ListForMemberAsync(id, limit, cancellationToken);
        return Ok(events.Select(AccessEventResponse.From).ToList());
    }

    // Which doors this person may open (replaces the whole set).
    [HttpPut("{id:guid}/doors")]
    public async Task<ActionResult<MemberResponse>> SetDoorsAsync(
        Guid id,
        [FromBody] SetMemberDoorsRequest request,
        CancellationToken cancellationToken)
    {
        var result = await memberService.SetDoorsAsync(id, request.DoorIds, cancellationToken);
        return this.ToActionResult(result, member => Ok(MemberResponse.From(member)));
    }

    [HttpDelete("{id:guid}")]
    public async Task<ActionResult> DeleteAsync(Guid id, CancellationToken cancellationToken)
    {
        var result = await memberService.DeleteAsync(id, this.CurrentUsername(), cancellationToken);
        return this.ToActionResult(result, _ => NoContent());
    }
}
