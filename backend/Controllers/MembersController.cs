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
        var result = await memberService.CreateAsync(request.Name, cancellationToken);
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
