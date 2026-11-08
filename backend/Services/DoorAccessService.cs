using Microsoft.EntityFrameworkCore;
using SmartDoor.Api.Data;
using SmartDoor.Api.Models;

namespace SmartDoor.Api.Services;

public class DoorAccessService(
    AppDbContext dbContext,
    IDoorPinService doorPinService,
    IDoorStatusStore doorStatusStore,
    IDeviceCommandService commandService) : IDoorAccessService
{
    private const string WrongPin = "Wrong PIN.";
    private const string DoorOffline = "This door is offline right now.";
    private const string NoSuchDoor = "Door not found.";

    // Waiting for an unlock to change: how long to hold the request, and how
    // often to look at the database meanwhile.
    private static readonly TimeSpan MaxWait = TimeSpan.FromSeconds(8);
    private static readonly TimeSpan CheckEvery = TimeSpan.FromMilliseconds(50);

    public async Task<ServiceResult<DeviceCommand>> UnlockWithPinAsync(
        Guid doorId,
        string pin,
        CancellationToken cancellationToken)
    {
        var door = await dbContext.Doors.AsNoTracking().FirstOrDefaultAsync(d => d.Id == doorId, cancellationToken);
        if (door is null)
        {
            return ServiceResult<DeviceCommand>.NotFound(NoSuchDoor);
        }

        // Checked before the PIN so a guess isn't used up on an offline door.
        if (!await doorStatusStore.IsOnlineAsync(doorId))
        {
            return ServiceResult<DeviceCommand>.Conflict(DoorOffline);
        }

        if (!await doorPinService.VerifyAsync(doorId, pin, cancellationToken))
        {
            // Logged so wrong guesses show up in the admin log.
            dbContext.AccessEvents.Add(new AccessEvent
            {
                Id = Guid.NewGuid(),
                Type = AccessEventType.Denied,
                Method = AccessMethod.AppPin,
                DoorId = door.Id,
                DoorName = door.Name,
                OccurredAt = DateTimeOffset.UtcNow,
            });
            await dbContext.SaveChangesAsync(cancellationToken);
            return ServiceResult<DeviceCommand>.Invalid(WrongPin);
        }

        return ServiceResult<DeviceCommand>.Ok(
            await commandService.QueueUnlockAsync(doorId, null, AccessMethod.AppPin, cancellationToken));
    }

    public async Task<ServiceResult<DeviceCommand>> UnlockForMemberAsync(
        Guid doorId,
        Member member,
        AccessMethod method,
        CancellationToken cancellationToken)
    {
        if (!await dbContext.Doors.AnyAsync(d => d.Id == doorId, cancellationToken))
        {
            return ServiceResult<DeviceCommand>.NotFound(NoSuchDoor);
        }

        var allowed = await dbContext.MemberDoors
            .AnyAsync(md => md.MemberId == member.Id && md.DoorId == doorId, cancellationToken);
        if (!allowed)
        {
            return ServiceResult<DeviceCommand>.Invalid("You can't open this door.");
        }

        if (!await doorStatusStore.IsOnlineAsync(doorId))
        {
            return ServiceResult<DeviceCommand>.Conflict(DoorOffline);
        }

        return ServiceResult<DeviceCommand>.Ok(
            await commandService.QueueUnlockAsync(doorId, member, method, cancellationToken));
    }

    public async Task<ServiceResult<DeviceCommand>> UnlockForAccountAsync(
        Guid doorId,
        Member member,
        string? pin,
        CancellationToken cancellationToken)
    {
        var door = await dbContext.Doors.AsNoTracking().FirstOrDefaultAsync(d => d.Id == doorId, cancellationToken);
        if (door is null)
        {
            return ServiceResult<DeviceCommand>.NotFound(NoSuchDoor);
        }

        if (!member.Enabled)
        {
            return ServiceResult<DeviceCommand>.Invalid("Your account is switched off.");
        }

        var allowed = await dbContext.MemberDoors
            .AnyAsync(md => md.MemberId == member.Id && md.DoorId == doorId, cancellationToken);
        if (!allowed)
        {
            return ServiceResult<DeviceCommand>.Invalid("You can't open this door.");
        }

        // Checked before the PIN so a guess is not used up on an offline door.
        if (!await doorStatusStore.IsOnlineAsync(doorId))
        {
            return ServiceResult<DeviceCommand>.Conflict(DoorOffline);
        }

        if (door.PinRequired)
        {
            if (door.PinHash is null)
            {
                return ServiceResult<DeviceCommand>.Invalid("This door has no PIN yet. Ask your admin to set one.");
            }

            if (string.IsNullOrEmpty(pin))
            {
                return ServiceResult<DeviceCommand>.Invalid("Type this door's PIN.");
            }

            if (!await doorPinService.VerifyAsync(doorId, pin, cancellationToken))
            {
                dbContext.AccessEvents.Add(new AccessEvent
                {
                    Id = Guid.NewGuid(),
                    Type = AccessEventType.Denied,
                    Method = AccessMethod.Account,
                    MemberId = member.Id,
                    MemberName = member.Name,
                    DoorId = door.Id,
                    DoorName = door.Name,
                    OccurredAt = DateTimeOffset.UtcNow,
                });
                await dbContext.SaveChangesAsync(cancellationToken);
                return ServiceResult<DeviceCommand>.Invalid(WrongPin);
            }
        }

        return ServiceResult<DeviceCommand>.Ok(
            await commandService.QueueUnlockAsync(doorId, member, AccessMethod.Account, cancellationToken));
    }

    public async Task<ServiceResult<DeviceCommand>> WaitForUnlockChangeAsync(
        Guid id,
        CommandStatus from,
        CancellationToken cancellationToken)
    {
        var deadline = DateTimeOffset.UtcNow + MaxWait;
        while (true)
        {
            // Forget what was loaded last time, or EF would hand back the same
            // (stale) row instead of re-reading it.
            dbContext.ChangeTracker.Clear();
            var result = await GetUnlockAsync(id, cancellationToken);
            if (result.Status != ServiceStatus.Ok
                || result.Value!.Status != from
                || DateTimeOffset.UtcNow >= deadline)
            {
                return result;
            }

            await Task.Delay(CheckEvery, cancellationToken);
        }
    }

    public async Task<ServiceResult<DeviceCommand>> GetUnlockAsync(Guid id, CancellationToken cancellationToken)
    {
        var result = await commandService.GetAsync(id, cancellationToken);
        return result.Value is { Type: CommandType.Unlock }
            ? result
            : ServiceResult<DeviceCommand>.NotFound("Unlock not found.");
    }
}
