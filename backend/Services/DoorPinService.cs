using Microsoft.EntityFrameworkCore;
using SmartDoor.Api.Data;
using SmartDoor.Api.Models;

namespace SmartDoor.Api.Services;

public class DoorPinService(AppDbContext dbContext, IPinHasher pinHasher) : IDoorPinService
{
    public async Task<DoorSettings> GetAsync(CancellationToken cancellationToken) =>
        await dbContext.DoorSettings.AsNoTracking().FirstOrDefaultAsync(cancellationToken)
        ?? new DoorSettings();

    public async Task<ServiceResult<DoorSettings>> SetAsync(string pin, CancellationToken cancellationToken)
    {
        if (!PinRules.IsValid(pin))
        {
            return ServiceResult<DoorSettings>.Invalid(PinRules.Describe());
        }

        var settings = await LoadForUpdateAsync(cancellationToken);
        var hashed = pinHasher.Hash(pin);
        settings.PinSalt = hashed.Salt;
        settings.PinHash = hashed.Hash;
        settings.PinUpdatedAt = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        return ServiceResult<DoorSettings>.Ok(settings);
    }

    public async Task<DoorSettings> ClearAsync(CancellationToken cancellationToken)
    {
        var settings = await LoadForUpdateAsync(cancellationToken);
        settings.PinSalt = null;
        settings.PinHash = null;
        settings.PinUpdatedAt = DateTimeOffset.UtcNow;
        await dbContext.SaveChangesAsync(cancellationToken);
        return settings;
    }

    public async Task<bool> VerifyAsync(string pin, CancellationToken cancellationToken)
    {
        if (!PinRules.IsValid(pin))
        {
            return false;
        }

        var settings = await GetAsync(cancellationToken);
        return settings is { PinSalt: not null, PinHash: not null }
               && pinHasher.Verify(pin, settings.PinSalt, settings.PinHash);
    }

    private async Task<DoorSettings> LoadForUpdateAsync(CancellationToken cancellationToken)
    {
        var settings = await dbContext.DoorSettings.FirstOrDefaultAsync(cancellationToken);
        if (settings is null)
        {
            settings = new DoorSettings();
            dbContext.DoorSettings.Add(settings);
        }

        return settings;
    }
}
