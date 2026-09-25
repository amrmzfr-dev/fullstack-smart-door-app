using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using SmartDoor.Api.Contracts;
using SmartDoor.Api.Data;

namespace SmartDoor.Api.Services;

// What one door is allowed to accept while offline: its PIN (hash) and the
// fingerprint slots on its sensor that belong to enabled people allowed on
// that door. Version is a hash of the content, so the door only re-downloads
// when something actually changed.
public class AccessListService(AppDbContext dbContext) : IAccessListService
{
    public async Task<AccessList> BuildAsync(Guid doorId, CancellationToken cancellationToken)
    {
        var slots = await dbContext.Fingerprints
            .AsNoTracking()
            .Where(f => f.DoorId == doorId
                        && f.Member!.Enabled
                        && f.Member.Doors.Any(md => md.DoorId == doorId))
            .Select(f => f.Slot)
            .OrderBy(slot => slot)
            .ToListAsync(cancellationToken);

        // The firmware expects a list of PINs, each with an owner ID. The door
        // PIN belongs to nobody, so it goes out as one entry with an empty ID
        // (which the log shows as "Door PIN").
        var door = await dbContext.Doors.AsNoTracking().FirstOrDefaultAsync(d => d.Id == doorId, cancellationToken);
        List<AccessListPin> pins = door is { PinSalt: not null, PinHash: not null }
            ? [new AccessListPin(Guid.Empty, door.PinSalt, door.PinHash)]
            : [];

        return new AccessList(ComputeVersion(pins, slots), pins, slots);
    }

    private static string ComputeVersion(IEnumerable<AccessListPin> pins, IEnumerable<int> slots)
    {
        var builder = new StringBuilder();
        foreach (var pin in pins)
        {
            builder.Append(pin.MemberId).Append(':').Append(pin.Salt).Append(':').Append(pin.Hash).Append(';');
        }
        builder.Append('|').AppendJoin(",", slots);

        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(builder.ToString()));
        return Convert.ToHexStringLower(hash)[..16];
    }
}
