using Microsoft.EntityFrameworkCore;
using SmartDoor.Api.Data;
using SmartDoor.Api.Models;

namespace SmartDoor.Api.Services;

public class FingerprintService(
    AppDbContext dbContext,
    IDoorStatusStore doorStatusStore,
    IDeviceCommandService commandService) : IFingerprintService
{
    private const int MaxLabelLength = 64;
    private const string DefaultLabel = "Finger";

    public async Task<ServiceResult<DeviceCommand>> StartEnrollmentAsync(
        Guid memberId,
        Guid doorId,
        string? label,
        string createdBy,
        CancellationToken cancellationToken)
    {
        var cleanLabel = string.IsNullOrWhiteSpace(label) ? DefaultLabel : label.Trim();
        if (cleanLabel.Length > MaxLabelLength)
        {
            return ServiceResult<DeviceCommand>.Invalid($"Label must be at most {MaxLabelLength} characters.");
        }

        var memberExists = await dbContext.Members.AnyAsync(m => m.Id == memberId, cancellationToken);
        if (!memberExists)
        {
            return ServiceResult<DeviceCommand>.NotFound("Member not found.");
        }

        // A finger enrolled on a door's sensor only works on that door, and only
        // counts while the person is allowed there.
        var allowed = await dbContext.MemberDoors
            .AnyAsync(md => md.MemberId == memberId && md.DoorId == doorId, cancellationToken);
        if (!allowed)
        {
            return ServiceResult<DeviceCommand>.Invalid("Allow this person on the door first.");
        }

        if (!await doorStatusStore.IsOnlineAsync(doorId))
        {
            return ServiceResult<DeviceCommand>.Conflict("That door is offline.");
        }

        var enrollmentRunning = await dbContext.DeviceCommands
            .AnyAsync(
                c => c.DoorId == doorId
                     && c.Type == CommandType.EnrollFingerprint
                     && (c.Status == CommandStatus.Pending
                         || c.Status == CommandStatus.Sent
                         || c.Status == CommandStatus.InProgress),
                cancellationToken);

        // Each sensor can only enroll one finger at a time. A stale one is
        // expired by the command service (on every door heartbeat), so this
        // can't block forever.
        if (enrollmentRunning)
        {
            return ServiceResult<DeviceCommand>.Conflict("Another fingerprint enrollment is already running on this door.");
        }

        var slot = await FindFreeSlotAsync(doorId, cancellationToken);
        if (slot is null)
        {
            return ServiceResult<DeviceCommand>.Conflict("This door's fingerprint sensor is full.");
        }

        var command = new DeviceCommand
        {
            Id = Guid.NewGuid(),
            DoorId = doorId,
            Type = CommandType.EnrollFingerprint,
            Slot = slot,
            MemberId = memberId,
            Label = cleanLabel,
            CreatedBy = createdBy,
        };
        dbContext.DeviceCommands.Add(command);
        await dbContext.SaveChangesAsync(cancellationToken);
        return ServiceResult<DeviceCommand>.Ok(command);
    }

    public async Task<ServiceResult<bool>> DeleteAsync(
        Guid fingerprintId,
        string deletedBy,
        CancellationToken cancellationToken)
    {
        var fingerprint = await dbContext.Fingerprints.FirstOrDefaultAsync(f => f.Id == fingerprintId, cancellationToken);
        if (fingerprint is null)
        {
            return ServiceResult<bool>.NotFound("Fingerprint not found.");
        }

        dbContext.Fingerprints.Remove(fingerprint);
        commandService.AddDeleteFingerprint(fingerprint.DoorId, fingerprint.Slot, deletedBy);
        await dbContext.SaveChangesAsync(cancellationToken);
        return ServiceResult<bool>.Ok(true);
    }

    private async Task<int?> FindFreeSlotAsync(Guid doorId, CancellationToken cancellationToken)
    {
        var used = await dbContext.Fingerprints.Where(f => f.DoorId == doorId).Select(f => f.Slot).ToListAsync(cancellationToken);
        var usedSet = used.ToHashSet();

        for (var slot = FingerprintSlots.Min; slot <= FingerprintSlots.Max; slot++)
        {
            if (!usedSet.Contains(slot))
            {
                return slot;
            }
        }

        return null;
    }
}
