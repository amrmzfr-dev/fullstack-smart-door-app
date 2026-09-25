using Microsoft.EntityFrameworkCore;
using SmartDoor.Api.Data;
using SmartDoor.Api.Models;

namespace SmartDoor.Api.Services;

public class MemberService(
    AppDbContext dbContext,
    IDeviceCommandService commandService) : IMemberService
{
    private const int MaxNameLength = 64;

    public async Task<IReadOnlyList<Member>> ListAsync(CancellationToken cancellationToken) =>
        await dbContext.Members
            .AsNoTracking()
            .Include(m => m.Fingerprints)
            .Include(m => m.PhoneKeys)
            .OrderBy(m => m.Name)
            .ToListAsync(cancellationToken);

    public async Task<ServiceResult<Member>> CreateAsync(string name, CancellationToken cancellationToken)
    {
        var cleanName = CleanName(name);
        if (cleanName is null)
        {
            return ServiceResult<Member>.Invalid($"Name is required (max {MaxNameLength} characters).");
        }

        var member = new Member { Id = Guid.NewGuid(), Name = cleanName };
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
            commandService.AddDeleteFingerprint(fingerprint.Slot, deletedBy);
        }

        dbContext.Members.Remove(member);
        await dbContext.SaveChangesAsync(cancellationToken);
        return ServiceResult<bool>.Ok(true);
    }

    private Task<Member?> FindAsync(Guid id, CancellationToken cancellationToken) =>
        dbContext.Members
            .Include(m => m.Fingerprints)
            .Include(m => m.PhoneKeys)
            .FirstOrDefaultAsync(m => m.Id == id, cancellationToken);

    private static string? CleanName(string? name)
    {
        var trimmed = name?.Trim();
        return string.IsNullOrEmpty(trimmed) || trimmed.Length > MaxNameLength ? null : trimmed;
    }

    private static ServiceResult<Member> NotFound() => ServiceResult<Member>.NotFound("Member not found.");
}
