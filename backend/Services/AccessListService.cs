using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using SmartDoor.Api.Contracts;
using SmartDoor.Api.Data;

namespace SmartDoor.Api.Services;

// What the door is allowed to accept while offline: PIN hashes and fingerprint
// slots of enabled members only. Version is a hash of the content, so the door
// only re-downloads when something actually changed.
public class AccessListService(AppDbContext dbContext) : IAccessListService
{
    public async Task<AccessList> BuildAsync(CancellationToken cancellationToken)
    {
        var members = await dbContext.Members
            .AsNoTracking()
            .Where(m => m.Enabled)
            .Include(m => m.Fingerprints)
            .ToListAsync(cancellationToken);

        var pins = members
            .Where(m => m.PinSalt is not null && m.PinHash is not null)
            .OrderBy(m => m.Id)
            .Select(m => new AccessListPin(m.Id, m.PinSalt!, m.PinHash!))
            .ToList();

        var slots = members
            .SelectMany(m => m.Fingerprints)
            .Select(f => f.Slot)
            .Order()
            .ToList();

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
