using Microsoft.EntityFrameworkCore;
using SmartDoor.Api.Models;
using SmartDoor.Api.Services;

namespace SmartDoor.Api.Data;

// The migration creates "Main Door" for the controller that existed before
// multi-door support. Its key is the old shared "Device:ApiKey", so that
// controller keeps working without re-flashing its key.
public static class DoorSeeder
{
    public static async Task SeedAsync(
        AppDbContext dbContext,
        IConfiguration configuration,
        CancellationToken cancellationToken = default)
    {
        var legacyKey = configuration["Device:ApiKey"];
        if (string.IsNullOrWhiteSpace(legacyKey))
        {
            return;
        }

        var mainDoor = await dbContext.Doors.FirstOrDefaultAsync(d => d.Id == Door.MainDoorId, cancellationToken);
        if (mainDoor is null || mainDoor.KeyHash is not null)
        {
            return;
        }

        mainDoor.KeyHash = DoorService.HashKey(legacyKey);
        await dbContext.SaveChangesAsync(cancellationToken);
    }
}
