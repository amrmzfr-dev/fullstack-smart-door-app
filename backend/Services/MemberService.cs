using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using SmartDoor.Api.Data;
using SmartDoor.Api.Models;

namespace SmartDoor.Api.Services;

public class MemberService(
    AppDbContext dbContext,
    IDeviceCommandService commandService) : IMemberService
{
    private const int MaxNameLength = 64;
    private static readonly PasswordHasher<Member> PasswordHasher = new();
    private static readonly Regex UsernamePattern = new("^[a-z0-9._-]{3,32}$", RegexOptions.Compiled);

    public async Task<IReadOnlyList<Member>> ListAsync(CancellationToken cancellationToken) =>
        await dbContext.Members
            .AsNoTracking()
            .Include(m => m.Fingerprints)
            .Include(m => m.PhoneKeys)
            .Include(m => m.Doors)
            .OrderBy(m => m.Name)
            .ToListAsync(cancellationToken);

    public async Task<ServiceResult<Member>> CreateAsync(
        string name,
        string? username,
        string? password,
        CancellationToken cancellationToken)
    {
        var cleanName = CleanName(name);
        if (cleanName is null)
        {
            return ServiceResult<Member>.Invalid($"Name is required (max {MaxNameLength} characters).");
        }

        var member = new Member { Id = Guid.NewGuid(), Name = cleanName };

        // A sign-in is optional when adding someone; fill in both parts or neither.
        if (!string.IsNullOrWhiteSpace(username) || !string.IsNullOrEmpty(password))
        {
            var problem = await ApplyAccountAsync(member, username, password, cancellationToken);
            if (problem is not null)
            {
                return ServiceResult<Member>.Invalid(problem);
            }
        }

        // New people may open every door to start with; the admin switches
        // doors off per person.
        var doorIds = await dbContext.Doors.Select(d => d.Id).ToListAsync(cancellationToken);
        member.Doors = doorIds.Select(doorId => new MemberDoor { MemberId = member.Id, DoorId = doorId }).ToList();
        dbContext.Members.Add(member);
        await dbContext.SaveChangesAsync(cancellationToken);
        return ServiceResult<Member>.Ok(member);
    }

    public async Task<ServiceResult<Member>> UpdateAsync(
        Guid id,
        string name,
        bool enabled,
        CancellationToken cancellationToken)
    {
        var cleanName = CleanName(name);
        if (cleanName is null)
        {
            return ServiceResult<Member>.Invalid($"Name is required (max {MaxNameLength} characters).");
        }

        var member = await FindAsync(id, cancellationToken);
        if (member is null)
        {
            return NotFound();
        }

        member.Name = cleanName;
        member.Enabled = enabled;
        await dbContext.SaveChangesAsync(cancellationToken);
        return ServiceResult<Member>.Ok(member);
    }

    public async Task<ServiceResult<Member>> SetAccountAsync(
        Guid id,
        string username,
        string? password,
        CancellationToken cancellationToken)
    {
        var member = await FindAsync(id, cancellationToken);
        if (member is null)
        {
            return NotFound();
        }

        var problem = await ApplyAccountAsync(member, username, password, cancellationToken);
        if (problem is not null)
        {
            return ServiceResult<Member>.Invalid(problem);
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return ServiceResult<Member>.Ok(member);
    }

    public async Task<ServiceResult<Member>> SetAdminAsync(Guid id, bool isAdmin, CancellationToken cancellationToken)
    {
        var member = await FindAsync(id, cancellationToken);
        if (member is null)
        {
            return NotFound();
        }

        if (isAdmin && member.Username is null)
        {
            return ServiceResult<Member>.Invalid("Make a sign-in for this person first.");
        }

        member.IsAdmin = isAdmin;
        await dbContext.SaveChangesAsync(cancellationToken);
        return ServiceResult<Member>.Ok(member);
    }

    public async Task<ServiceResult<Member>> ClearAccountAsync(Guid id, CancellationToken cancellationToken)
    {
        var member = await FindAsync(id, cancellationToken);
        if (member is null)
        {
            return NotFound();
        }

        member.Username = null;
        member.IsAdmin = false;
        member.PasswordHash = null;
        member.PasswordHint = null;
        member.AccountCreatedAt = null;
        member.LastLoginAt = null;
        await dbContext.SaveChangesAsync(cancellationToken);
        return ServiceResult<Member>.Ok(member);
    }

    public async Task<ServiceResult<Member>> SetDoorsAsync(
        Guid id,
        IReadOnlyList<Guid> doorIds,
        CancellationToken cancellationToken)
    {
        var member = await FindAsync(id, cancellationToken);
        if (member is null)
        {
            return NotFound();
        }

        var wanted = doorIds.Distinct().ToList();
        var existingDoors = await dbContext.Doors
            .Where(d => wanted.Contains(d.Id))
            .Select(d => d.Id)
            .ToListAsync(cancellationToken);
        if (existingDoors.Count != wanted.Count)
        {
            return ServiceResult<Member>.Invalid("Unknown door.");
        }

        // Their fingerprints on a door they lose stop working there at once
        // (the access list drops them); the templates stay, so switching the
        // door back on restores them.
        member.Doors.RemoveAll(md => !wanted.Contains(md.DoorId));
        foreach (var doorId in wanted.Where(doorId => member.Doors.All(md => md.DoorId != doorId)))
        {
            member.Doors.Add(new MemberDoor { MemberId = member.Id, DoorId = doorId });
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return ServiceResult<Member>.Ok(member);
    }

    public async Task<ServiceResult<bool>> DeleteAsync(Guid id, string deletedBy, CancellationToken cancellationToken)
    {
        var member = await FindAsync(id, cancellationToken);
        if (member is null)
        {
            return ServiceResult<bool>.NotFound("Member not found.");
        }

        // Access is revoked as soon as the member row is gone (the access list
        // drops their slots); the delete commands also wipe the templates off
        // the sensor itself.
        foreach (var fingerprint in member.Fingerprints)
        {
            commandService.AddDeleteFingerprint(fingerprint.DoorId, fingerprint.Slot, deletedBy);
        }

        dbContext.Members.Remove(member);
        await dbContext.SaveChangesAsync(cancellationToken);
        return ServiceResult<bool>.Ok(true);
    }

    // Returns what is wrong, or null when the username / password were applied.
    private async Task<string?> ApplyAccountAsync(
        Member member,
        string? username,
        string? password,
        CancellationToken cancellationToken)
    {
        var cleanUsername = username?.Trim().ToLowerInvariant();
        if (string.IsNullOrEmpty(cleanUsername) || !UsernamePattern.IsMatch(cleanUsername))
        {
            return "Username needs 3 to 32 characters: letters, numbers, dot, dash or underscore.";
        }

        var taken = await dbContext.Members.AnyAsync(
            m => m.Username == cleanUsername && m.Id != member.Id,
            cancellationToken);
        if (taken)
        {
            return "That username is already taken.";
        }

        if (string.IsNullOrEmpty(password))
        {
            if (member.PasswordHash is null)
            {
                return "Choose a password for this account.";
            }
        }
        else
        {
            var problem = PasswordHintBuilder.Check(password);
            if (problem is not null)
            {
                return problem.Replace("new password", "password");
            }

            member.PasswordHash = PasswordHasher.HashPassword(member, password);
            member.PasswordHint = PasswordHintBuilder.Build(password);
        }

        member.Username = cleanUsername;
        member.AccountCreatedAt ??= DateTimeOffset.UtcNow;
        return null;
    }

    private Task<Member?> FindAsync(Guid id, CancellationToken cancellationToken) =>
        dbContext.Members
            .Include(m => m.Fingerprints)
            .Include(m => m.PhoneKeys)
            .Include(m => m.Doors)
            .FirstOrDefaultAsync(m => m.Id == id, cancellationToken);

    private static string? CleanName(string? name)
    {
        var trimmed = name?.Trim();
        return string.IsNullOrEmpty(trimmed) || trimmed.Length > MaxNameLength ? null : trimmed;
    }

    private static ServiceResult<Member> NotFound() => ServiceResult<Member>.NotFound("Member not found.");
}
