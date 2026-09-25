using Microsoft.EntityFrameworkCore;
using SmartDoor.Api.Data;
using SmartDoor.Api.Models;

namespace SmartDoor.Api.Services;

public class DoorPinService(AppDbContext dbContext, IPinHasher pinHasher) : IDoorPinService
{
    public async Task<ServiceResult<Door>> SetAsync(Guid doorId, string pin, CancellationToken cancellationToken)
    {
        if (!PinRules.IsValid(pin))
        {
            return ServiceResult<Door>.Invalid(PinRules.Describe());
        }

        var door = await dbContext.Doors.FirstOrDefaultAsync(d => d.Id == doorId, cancellationToken);
        if (door is null)
        {
            return ServiceResult<Door>.NotFound("Door not found.");
        }

        var hashed = pinHasher.Hash(pin);
        door.PinSalt = hashed.Salt;
        door.PinHash = hashed.Hash;
        door.PinUpdatedAt = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        return ServiceResult<Door>.Ok(door);
    }

    public async Task<ServiceResult<Door>> ClearAsync(Guid doorId, CancellationToken cancellationToken)
    {
        var door = await dbContext.Doors.FirstOrDefaultAsync(d => d.Id == doorId, cancellationToken);
        if (door is null)
        {
            return ServiceResult<Door>.NotFound("Door not found.");
        }

        door.PinSalt = null;
        door.PinHash = null;
        door.PinUpdatedAt = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        return ServiceResult<Door>.Ok(door);
    }

    public async Task<bool> VerifyAsync(Guid doorId, string pin, CancellationToken cancellationToken)
    {
        if (!PinRules.IsValid(pin))
        {
            return false;
        }

        var door = await dbContext.Doors.AsNoTracking().FirstOrDefaultAsync(d => d.Id == doorId, cancellationToken);
        return door is { PinSalt: not null, PinHash: not null }
               && pinHasher.Verify(pin, door.PinSalt, door.PinHash);
    }
}
