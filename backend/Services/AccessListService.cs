using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using SmartDoor.Api.Contracts;
using SmartDoor.Api.Data;

namespace SmartDoor.Api.Services;

// What the door is allowed to accept while offline: the one door PIN (hash)
// and the fingerprint slots of enabled members. Version is a hash of the
// content, so the door only re-downloads when something actually changed.
public class AccessListService(AppDbContext dbContext, IDoorPinService doorPinService) : IAccessListService
{
    public async Task<AccessList> BuildAsync(CancellationToken cancellationToken)
    {
        var slots = await dbContext.Fingerprints
            .AsNoTracking()
            .Where(f => f.Member!.Enabled)
            .Select(f => f.Slot)
            .OrderBy(slot => slot)
            .ToListAsync(cancellationToken);

        // The firmware expects a list of PINs, each with an owner ID. The door
        // PIN belongs to nobody, so it goes out as one entry with an empty ID
        // (which the log shows as "Door PIN").
        var settings = await doorPinService.GetAsync(cancellationToken);
        List<AccessListPin> pins = settings is { PinSalt: not null, PinHash: not null }
            ? [new AccessListPin(Guid.Empty, settings.PinSalt, settings.PinHash)]
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
