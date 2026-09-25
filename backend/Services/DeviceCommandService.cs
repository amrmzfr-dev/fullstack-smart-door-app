using Microsoft.EntityFrameworkCore;
using SmartDoor.Api.Contracts;
using SmartDoor.Api.Data;
using SmartDoor.Api.Models;

namespace SmartDoor.Api.Services;

public class DeviceCommandService(
    AppDbContext dbContext,
    ILogger<DeviceCommandService> logger) : IDeviceCommandService
{
    private const int MaxCommandsPerHeartbeat = 5;
    private const string SystemUser = "system";

    // An unlock that sits around must never fire late — someone could walk up
    // to a door that opens by itself minutes after the button was pressed.
    private static readonly TimeSpan UnlockTimeout = TimeSpan.FromSeconds(15);

    // Door never picked the enrollment up (offline / rebooting).
    private static readonly TimeSpan EnrollPickupTimeout = TimeSpan.FromSeconds(20);

    // Door picked it up but went quiet mid-way. The firmware gives up on its
    // own after ENROLL_STEP_TIMEOUT_MS per step, so this is only a backstop.
    private static readonly TimeSpan EnrollIdleTimeout = TimeSpan.FromSeconds(60);

    // Sent but never confirmed (door rebooted mid-way) — send it again.
    private static readonly TimeSpan DeleteResendAfter = TimeSpan.FromSeconds(60);

    public async Task<DeviceCommand> QueueUnlockAsync(
        Member member,
        AccessMethod method,
        CancellationToken cancellationToken)
    {
        var command = new DeviceCommand
        {
            Id = Guid.NewGuid(),
            Type = CommandType.Unlock,
            MemberId = member.Id,
            Method = method,
            CreatedBy = member.Name,
        };
        dbContext.DeviceCommands.Add(command);
        await dbContext.SaveChangesAsync(cancellationToken);
        return command;
    }

    public async Task<ServiceResult<DeviceCommand>> GetAsync(Guid id, CancellationToken cancellationToken)
    {
        await ExpireStaleAsync(cancellationToken);
        var command = await dbContext.DeviceCommands.FirstOrDefaultAsync(c => c.Id == id, cancellationToken);
        return command is null
            ? ServiceResult<DeviceCommand>.NotFound("Command not found.")
            : ServiceResult<DeviceCommand>.Ok(command);
    }

    public async Task<ServiceResult<DeviceCommand>> CancelAsync(Guid id, CancellationToken cancellationToken)
    {
        var command = await dbContext.DeviceCommands.FirstOrDefaultAsync(c => c.Id == id, cancellationToken);
        if (command is null)
        {
            return ServiceResult<DeviceCommand>.NotFound("Command not found.");
        }

        if (command.IsActive)
        {
            command.Status = CommandStatus.Cancelled;
            command.Step = null;
            command.UpdatedAt = DateTimeOffset.UtcNow;
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        return ServiceResult<DeviceCommand>.Ok(command);
    }

    public DeviceCommand AddDeleteFingerprint(int slot, string createdBy)
    {
        var command = new DeviceCommand
        {
            Id = Guid.NewGuid(),
            Type = CommandType.DeleteFingerprint,
            Slot = slot,
            CreatedBy = createdBy,
        };
        dbContext.DeviceCommands.Add(command);
        return command;
    }

    public async Task<IReadOnlyList<DeviceCommand>> TakePendingForDeviceAsync(CancellationToken cancellationToken)
    {
        await ExpireStaleAsync(cancellationToken);

        // Oldest first: a delete queued before an enrollment into the same
        // slot must run first, or it would wipe the new template.
        var pending = await dbContext.DeviceCommands
            .Where(c => c.Status == CommandStatus.Pending)
            .OrderBy(c => c.CreatedAt)
            .Take(MaxCommandsPerHeartbeat)
            .ToListAsync(cancellationToken);

        if (pending.Count == 0)
        {
            return pending;
        }

        var now = DateTimeOffset.UtcNow;
        foreach (var command in pending)
        {
            command.Status = CommandStatus.Sent;
            command.UpdatedAt = now;
        }

        await dbContext.SaveChangesAsync(cancellationToken);
        return pending;
    }

    public async Task<ServiceResult<DeviceCommand>> ApplyDeviceUpdateAsync(
        Guid id,
        DeviceCommandUpdate update,
        CancellationToken cancellationToken)
    {
        var command = await dbContext.DeviceCommands.FirstOrDefaultAsync(c => c.Id == id, cancellationToken);
        if (command is null)
        {
            return ServiceResult<DeviceCommand>.NotFound("Command not found.");
        }

        if (!command.IsActive)
        {
            // Too late (cancelled / expired). An enrollment that still finished
            // left a template on the sensor nobody owns — clean it up.
            if (command.Type == CommandType.EnrollFingerprint
                && update.Status == CommandStatus.Succeeded
                && command.Slot is int orphanSlot
                && !await IsSlotInUseAsync(orphanSlot, command.Id, cancellationToken))
            {
                AddDeleteFingerprint(orphanSlot, SystemUser);
                await dbContext.SaveChangesAsync(cancellationToken);
            }

            return ServiceResult<DeviceCommand>.Ok(command);
        }

        var now = DateTimeOffset.UtcNow;
        switch (update.Status)
        {
            case CommandStatus.InProgress:
                command.Status = CommandStatus.InProgress;
                command.Step = Truncate(update.Step, 32);
                command.Message = Truncate(update.Message, 256);
                break;

            case CommandStatus.Succeeded:
                command.Status = CommandStatus.Succeeded;
                command.Step = null;
                command.Message = Truncate(update.Message, 256);
                await ApplySuccessAsync(command, now, cancellationToken);
                break;

            case CommandStatus.Failed:
                command.Status = CommandStatus.Failed;
                command.Step = null;
                command.Message = Truncate(update.Message, 256) ?? "The door controller reported a failure.";
                break;

            default:
                return ServiceResult<DeviceCommand>.Invalid("Status must be in_progress, succeeded or failed.");
        }

        command.UpdatedAt = now;
        await dbContext.SaveChangesAsync(cancellationToken);
        return ServiceResult<DeviceCommand>.Ok(command);
    }

    private async Task ApplySuccessAsync(DeviceCommand command, DateTimeOffset now, CancellationToken cancellationToken)
    {
        switch (command.Type)
        {
            case CommandType.Unlock:
                var unlockedBy = command.MemberId is Guid unlockMemberId
                    ? await dbContext.Members.AsNoTracking().FirstOrDefaultAsync(m => m.Id == unlockMemberId, cancellationToken)
                    : null;
                dbContext.AccessEvents.Add(new AccessEvent
                {
                    Id = Guid.NewGuid(),
                    Type = AccessEventType.Granted,
                    Method = command.Method ?? AccessMethod.Remote,
                    MemberId = unlockedBy?.Id,
                    MemberName = unlockedBy?.Name ?? command.CreatedBy,
                    OccurredAt = now,
                });
                break;

            case CommandType.EnrollFingerprint when command.Slot is int slot:
                var member = command.MemberId is Guid memberId
                    ? await dbContext.Members.FirstOrDefaultAsync(m => m.Id == memberId, cancellationToken)
                    : null;

                if (member is null)
                {
                    // Member was deleted while they were enrolling.
                    AddDeleteFingerprint(slot, SystemUser);
                    break;
                }

                var existing = await dbContext.Fingerprints.FirstOrDefaultAsync(f => f.Slot == slot, cancellationToken);
                if (existing is not null)
                {
                    logger.LogWarning("Enrollment into slot {Slot} replaced an existing fingerprint record", slot);
                    dbContext.Fingerprints.Remove(existing);
                }

                dbContext.Fingerprints.Add(new Fingerprint
                {
                    Id = Guid.NewGuid(),
                    MemberId = member.Id,
                    Slot = slot,
                    Label = command.Label ?? "Finger",
                    EnrolledAt = now,
                });
                break;
        }
    }

    private async Task<bool> IsSlotInUseAsync(int slot, Guid exceptCommandId, CancellationToken cancellationToken)
    {
        if (await dbContext.Fingerprints.AnyAsync(f => f.Slot == slot, cancellationToken))
        {
            return true;
        }

        return await dbContext.DeviceCommands.AnyAsync(
            c => c.Id != exceptCommandId
                 && c.Type == CommandType.EnrollFingerprint
                 && c.Slot == slot
                 && (c.Status == CommandStatus.Pending
                     || c.Status == CommandStatus.Sent
                     || c.Status == CommandStatus.InProgress),
            cancellationToken);
    }

    private async Task ExpireStaleAsync(CancellationToken cancellationToken)
    {
        var active = await dbContext.DeviceCommands
            .Where(c => c.Status == CommandStatus.Pending
                        || c.Status == CommandStatus.Sent
                        || c.Status == CommandStatus.InProgress)
            .ToListAsync(cancellationToken);

        var now = DateTimeOffset.UtcNow;
        var changed = false;

        foreach (var command in active)
        {
            var idle = now - command.UpdatedAt;
            switch (command.Type)
            {
                case CommandType.Unlock when idle > UnlockTimeout:
                    Expire(command, now, "The door didn't respond in time.");
                    changed = true;
                    break;

                case CommandType.EnrollFingerprint
                    when command.Status == CommandStatus.Pending && idle > EnrollPickupTimeout:
                    Expire(command, now, "The door didn't pick up the request. Is it online?");
                    changed = true;
                    break;

                case CommandType.EnrollFingerprint when idle > EnrollIdleTimeout:
                    Expire(command, now, "The door stopped responding during enrollment.");
                    changed = true;
                    break;

                case CommandType.DeleteFingerprint
                    when command.Status != CommandStatus.Pending && idle > DeleteResendAfter:
                    command.Status = CommandStatus.Pending;
                    command.UpdatedAt = now;
                    changed = true;
                    break;
            }
        }

        if (changed)
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
    }

    private static void Expire(DeviceCommand command, DateTimeOffset now, string message)
    {
        command.Status = CommandStatus.Expired;
        command.Step = null;
        command.Message = message;
        command.UpdatedAt = now;
    }

    private static string? Truncate(string? value, int maxLength) =>
        value is null || value.Length <= maxLength ? value : value[..maxLength];
}
