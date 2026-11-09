using System.IdentityModel.Tokens.Jwt;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using SmartDoor.Api.Contracts;
using SmartDoor.Api.Data;
using SmartDoor.Api.Models;
using SmartDoor.Api.Services;

namespace SmartDoor.Api.Controllers;

// A person's own account: sign in with the username and password the admin
// made for them, see the doors they may open, and open them. Every sign-in
// and every unlock lands in the admin log under their name.
[ApiController]
[Route("api/member")]
[Authorize(Policy = MemberPolicy.Name)]
public class MemberPortalController(
    AppDbContext dbContext,
    IJwtTokenService jwtTokenService,
    IDoorStatusStore doorStatusStore,
    IDoorAccessService doorAccessService,
    IAccessEventService accessEventService) : ControllerBase
{
    private static readonly PasswordHasher<Member> PasswordHasher = new();
    private const string BadLogin = "Wrong username or password.";

    [HttpPost("login")]
    [AllowAnonymous]
    [EnableRateLimiting(RateLimits.PinAttempts)]
    public async Task<ActionResult<MemberLoginResponse>> LoginAsync(
        [FromBody] MemberLoginRequest request,
        CancellationToken cancellationToken)
    {
        var username = (request.Username ?? string.Empty).Trim().ToLowerInvariant();
        if (username.Length == 0 || string.IsNullOrEmpty(request.Password))
        {
            return BadRequest("Username and password are required.");
        }

        var member = await dbContext.Members.FirstOrDefaultAsync(m => m.Username == username, cancellationToken);
        var passwordOk = member?.PasswordHash is not null
            && PasswordHasher.VerifyHashedPassword(member, member.PasswordHash, request.Password)
                != PasswordVerificationResult.Failed;

        if (member is null || !passwordOk)
        {
            dbContext.AccessEvents.Add(new AccessEvent
            {
                Id = Guid.NewGuid(),
                Type = AccessEventType.SignInFailed,
                Method = AccessMethod.Account,
                MemberId = member?.Id,
                MemberName = member?.Name,
                Username = username.Length > 64 ? username[..64] : username,
                OccurredAt = DateTimeOffset.UtcNow,
            });
            await dbContext.SaveChangesAsync(cancellationToken);
            return Unauthorized(BadLogin);
        }

        if (!member.Enabled)
        {
            return Unauthorized("This account is switched off. Ask your admin.");
        }

        member.LastLoginAt = DateTimeOffset.UtcNow;
        dbContext.AccessEvents.Add(new AccessEvent
        {
            Id = Guid.NewGuid(),
            Type = AccessEventType.SignIn,
            Method = AccessMethod.Account,
            MemberId = member.Id,
            MemberName = member.Name,
            Username = member.Username,
            OccurredAt = member.LastLoginAt.Value,
        });
        await dbContext.SaveChangesAsync(cancellationToken);

        var token = jwtTokenService.GenerateMemberToken(member.Id, member.Username!);
        return Ok(new MemberLoginResponse(token, member.Name, member.Username!));
    }

    [HttpGet("me")]
    public async Task<ActionResult<MemberProfileResponse>> MeAsync(CancellationToken cancellationToken)
    {
        var member = await CurrentMemberAsync(cancellationToken);
        if (member is null)
        {
            return Unauthorized();
        }

        var doorIds = await dbContext.MemberDoors
            .AsNoTracking()
            .Where(md => md.MemberId == member.Id)
            .Select(md => md.DoorId)
            .ToListAsync(cancellationToken);
        var doors = await dbContext.Doors
            .AsNoTracking()
            .Where(d => doorIds.Contains(d.Id))
            .OrderBy(d => d.CreatedAt)
            .ThenBy(d => d.Name)
            .ToListAsync(cancellationToken);

        var responses = new List<MemberDoorResponse>(doors.Count);
        foreach (var door in doors)
        {
            var online = await doorStatusStore.IsOnlineAsync(door.Id);
            var snapshot = online ? await doorStatusStore.GetAsync(door.Id) : null;
            responses.Add(new MemberDoorResponse(
                door.Id,
                door.Name,
                online,
                snapshot?.DoorOpen,
                snapshot?.Locked,
                door.PinRequired,
                door.PinHash is not null,
                DoorScheduleRules.ToDto(door),
                door.GeofenceEnabled));
        }

        var phones = await dbContext.PhoneKeys.CountAsync(k => k.MemberId == member.Id, cancellationToken);
        var fingerprints = await dbContext.Fingerprints.CountAsync(f => f.MemberId == member.Id, cancellationToken);

        return Ok(new MemberProfileResponse(
            member.Id,
            member.Name,
            member.Username!,
            member.PasswordHint,
            member.LastLoginAt,
            member.IsAdmin,
            phones,
            fingerprints,
            responses));
    }

    // For a person the admin gave admin access: a fresh admin sign-in that lasts
    // a day, so taking the access away stops working within a day (and the page
    // asks again every hour). Everyone else gets 403.
    [HttpGet("admin-token")]
    public async Task<ActionResult<MemberAdminTokenResponse>> AdminTokenAsync(CancellationToken cancellationToken)
    {
        var member = await CurrentMemberAsync(cancellationToken);
        if (member is null)
        {
            return Unauthorized();
        }

        if (!member.IsAdmin)
        {
            return StatusCode(StatusCodes.Status403Forbidden, "You don't have admin access.");
        }

        return Ok(new MemberAdminTokenResponse(
            jwtTokenService.GenerateAdminTokenForMember(member.Id, member.Username!),
            member.Username!));
    }

    [HttpPut("password")]
    public async Task<ActionResult<MemberProfileResponse>> ChangePasswordAsync(
        [FromBody] MemberChangePasswordRequest request,
        CancellationToken cancellationToken)
    {
        var member = await CurrentMemberAsync(cancellationToken);
        if (member is null)
        {
            return Unauthorized();
        }

        if (string.IsNullOrEmpty(request.CurrentPassword)
            || member.PasswordHash is null
            || PasswordHasher.VerifyHashedPassword(member, member.PasswordHash, request.CurrentPassword)
                == PasswordVerificationResult.Failed)
        {
            return BadRequest("Your current password is not right.");
        }

        var problem = PasswordHintBuilder.Check(request.NewPassword);
        if (problem is not null)
        {
            return BadRequest(problem);
        }

        if (request.NewPassword == request.CurrentPassword)
        {
            return BadRequest("The new password must be different from the current one.");
        }

        member.PasswordHash = PasswordHasher.HashPassword(member, request.NewPassword);
        member.PasswordHint = PasswordHintBuilder.Build(request.NewPassword);
        await dbContext.SaveChangesAsync(cancellationToken);
        return await MeAsync(cancellationToken);
    }

    // Press Unlock. The door's PIN is only asked for when the admin turned
    // "PIN required" on for that door.
    [HttpPost("unlock")]
    [EnableRateLimiting(RateLimits.PinAttempts)]
    public async Task<ActionResult<UnlockProgressResponse>> UnlockAsync(
        [FromBody] MemberUnlockRequest request,
        CancellationToken cancellationToken)
    {
        var member = await CurrentMemberAsync(cancellationToken);
        if (member is null)
        {
            return Unauthorized();
        }

        var location = request is { Latitude: double lat, Longitude: double lon }
            ? new GeoPoint(lat, lon, request.AccuracyMeters)
            : null;
        var result = await doorAccessService.UnlockForAccountAsync(request.DoorId, member, request.Pin, location, cancellationToken);
        return this.ToActionResult(result, command => Accepted(UnlockProgressResponse.From(command)));
    }

    // Same long-poll as the keypad app: held until the status changes.
    [HttpGet("unlock/{id:guid}")]
    public async Task<ActionResult<UnlockProgressResponse>> UnlockProgressAsync(
        Guid id,
        [FromQuery] CommandStatus? changedFrom,
        CancellationToken cancellationToken)
    {
        var result = changedFrom is CommandStatus status
            ? await doorAccessService.WaitForUnlockChangeAsync(id, status, cancellationToken)
            : await doorAccessService.GetUnlockAsync(id, cancellationToken);
        return this.ToActionResult(result, command => Ok(UnlockProgressResponse.From(command)));
    }

    // This person's own history only.
    [HttpGet("activity")]
    public async Task<ActionResult<IReadOnlyList<AccessEventResponse>>> ActivityAsync(
        [FromQuery] int limit = 40,
        CancellationToken cancellationToken = default)
    {
        var member = await CurrentMemberAsync(cancellationToken);
        if (member is null)
        {
            return Unauthorized();
        }

        var events = await accessEventService.ListForMemberAsync(member.Id, limit, cancellationToken);
        return Ok(events.Select(AccessEventResponse.From).ToList());
    }

    private async Task<Member?> CurrentMemberAsync(CancellationToken cancellationToken)
    {
        var sub = User.FindFirst(JwtRegisteredClaimNames.Sub)?.Value;
        if (!Guid.TryParse(sub, out var id))
        {
            return null;
        }

        var member = await dbContext.Members.FirstOrDefaultAsync(m => m.Id == id, cancellationToken);
        return member is { Username: not null } && member.Enabled ? member : null;
    }
}
