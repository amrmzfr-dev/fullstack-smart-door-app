using Microsoft.EntityFrameworkCore;
using SmartDoor.Api.Contracts;
using SmartDoor.Api.Data;
using SmartDoor.Api.Models;

namespace SmartDoor.Api.Services;

public class AccessEventService(AppDbContext dbContext) : IAccessEventService
{
    private const int MaxEventsPerBatch = 50;
    private const int MaxListLimit = 500;
    private static readonly TimeSpan MaxEventAge = TimeSpan.FromDays(7);

    public async Task RecordDeviceEventsAsync(IReadOnlyList<DeviceEvent> events, CancellationToken cancellationToken)
    {
        var batch = events.Take(MaxEventsPerBatch).ToList();
        if (batch.Count == 0)
        {
            return;
        }

        // Resolve who each event belongs to: a fingerprint slot maps through
        // the Fingerprints table, a keypad PIN arrives with its member ID.
        var slots = batch.Where(e => e.FingerprintSlot is not null).Select(e => e.FingerprintSlot!.Value).Distinct().ToList();
        var fingerprintOwners = await dbContext.Fingerprints
            .AsNoTracking()
            .Where(f => slots.Contains(f.Slot))
            .Select(f => new { f.Slot, f.MemberId })
            .ToDictionaryAsync(f => f.Slot, f => f.MemberId, cancellationToken);

        var memberIds = batch
            .Select(e => e.MemberId)
            .Where(id => id is not null)
            .Select(id => id!.Value)
            .Concat(fingerprintOwners.Values)
            .Distinct()
            .ToList();
        var memberNames = await dbContext.Members
            .AsNoTracking()
            .Where(m => memberIds.Contains(m.Id))
            .ToDictionaryAsync(m => m.Id, m => m.Name, cancellationToken);

        var now = DateTimeOffset.UtcNow;
        foreach (var deviceEvent in batch)
        {
            Guid? memberId = deviceEvent.FingerprintSlot is int slot && fingerprintOwners.TryGetValue(slot, out var owner)
                ? owner
                : deviceEvent.MemberId;
            string? memberName = memberId is Guid id && memberNames.TryGetValue(id, out var name) ? name : null;

            var age = TimeSpan.FromMilliseconds(Math.Clamp(deviceEvent.AgeMs, 0, (long)MaxEventAge.TotalMilliseconds));

            dbContext.AccessEvents.Add(new AccessEvent
            {
                Id = Guid.NewGuid(),
                Type = deviceEvent.Type,
                Method = deviceEvent.Method,
                MemberId = memberName is null ? null : memberId,
                MemberName = memberName,
                FingerprintSlot = deviceEvent.FingerprintSlot,
                OccurredAt = now - age,
                ReceivedAt = now,
            });
        }

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<AccessEvent>> ListAsync(int limit, CancellationToken cancellationToken) =>
        await dbContext.AccessEvents
            .AsNoTracking()
            .OrderByDescending(e => e.OccurredAt)
            .Take(Math.Clamp(limit, 1, MaxListLimit))
            .ToListAsync(cancellationToken);
}
