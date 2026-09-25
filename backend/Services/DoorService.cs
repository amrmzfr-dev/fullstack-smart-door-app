using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using SmartDoor.Api.Data;
using SmartDoor.Api.Models;

namespace SmartDoor.Api.Services;

public class DoorService(AppDbContext dbContext) : IDoorService
{
    private const int MaxNameLength = 64;
    private const int KeyBytes = 24;

    public async Task<IReadOnlyList<Door>> ListAsync(CancellationToken cancellationToken) =>
        await dbContext.Doors
            .AsNoTracking()
            .OrderBy(d => d.CreatedAt)
            .ThenBy(d => d.Name)
            .ToListAsync(cancellationToken);

    public Task<Door?> GetAsync(Guid id, CancellationToken cancellationToken) =>
        dbContext.Doors.AsNoTracking().FirstOrDefaultAsync(d => d.Id == id, cancellationToken);

    public async Task<ServiceResult<CreatedDoor>> CreateAsync(string name, CancellationToken cancellationToken)
    {
        var cleanName = CleanName(name);
        if (cleanName is null)
        {
            return ServiceResult<CreatedDoor>.Invalid($"Name is required (max {MaxNameLength} characters).");
        }

        var key = NewKey();
        var door = new Door { Id = Guid.NewGuid(), Name = cleanName, KeyHash = HashKey(key) };
        dbContext.Doors.Add(door);

        // New doors start open to everyone already on the list; the admin
        // switches people off per door.
        var memberIds = await dbContext.Members.Select(m => m.Id).ToListAsync(cancellationToken);
        dbContext.MemberDoors.AddRange(memberIds.Select(id => new MemberDoor { MemberId = id, DoorId = door.Id }));

        await dbContext.SaveChangesAsync(cancellationToken);
        return ServiceResult<CreatedDoor>.Ok(new CreatedDoor(door, key));
    }

    public async Task<ServiceResult<Door>> RenameAsync(Guid id, string name, CancellationToken cancellationToken)
    {
        var cleanName = CleanName(name);
        if (cleanName is null)
        {
            return ServiceResult<Door>.Invalid($"Name is required (max {MaxNameLength} characters).");
        }

        var door = await dbContext.Doors.FirstOrDefaultAsync(d => d.Id == id, cancellationToken);
        if (door is null)
        {
            return ServiceResult<Door>.NotFound("Door not found.");
        }

        door.Name = cleanName;
        await dbContext.SaveChangesAsync(cancellationToken);
        return ServiceResult<Door>.Ok(door);
    }

    public async Task<ServiceResult<CreatedDoor>> ResetKeyAsync(Guid id, CancellationToken cancellationToken)
    {
        var door = await dbContext.Doors.FirstOrDefaultAsync(d => d.Id == id, cancellationToken);
        if (door is null)
        {
            return ServiceResult<CreatedDoor>.NotFound("Door not found.");
        }

        var key = NewKey();
        door.KeyHash = HashKey(key);
        await dbContext.SaveChangesAsync(cancellationToken);
        return ServiceResult<CreatedDoor>.Ok(new CreatedDoor(door, key));
    }

    public async Task<ServiceResult<bool>> DeleteAsync(Guid id, CancellationToken cancellationToken)
    {
        var door = await dbContext.Doors.FirstOrDefaultAsync(d => d.Id == id, cancellationToken);
        if (door is null)
        {
            return ServiceResult<bool>.NotFound("Door not found.");
        }

        // Its fingerprints, access and commands go with it (cascade); the log
        // keeps its copied door name.
        dbContext.Doors.Remove(door);
        await dbContext.SaveChangesAsync(cancellationToken);
        return ServiceResult<bool>.Ok(true);
    }

    public Task<Door?> FindByKeyAsync(string key, CancellationToken cancellationToken)
    {
        if (string.IsNullOrEmpty(key))
        {
            return Task.FromResult<Door?>(null);
        }

        var hash = HashKey(key);
        return dbContext.Doors.AsNoTracking().FirstOrDefaultAsync(d => d.KeyHash == hash, cancellationToken);
    }

    public static string HashKey(string key) =>
        Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(key)));

    private static string NewKey() => Convert.ToHexStringLower(RandomNumberGenerator.GetBytes(KeyBytes));

    private static string? CleanName(string? name)
    {
        var trimmed = name?.Trim();
        return string.IsNullOrEmpty(trimmed) || trimmed.Length > MaxNameLength ? null : trimmed;
    }
}
