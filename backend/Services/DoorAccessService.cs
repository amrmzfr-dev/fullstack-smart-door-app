using Microsoft.EntityFrameworkCore;
using SmartDoor.Api.Data;
using SmartDoor.Api.Models;

namespace SmartDoor.Api.Services;

public class DoorAccessService(
    AppDbContext dbContext,
    IPinHasher pinHasher,
    IDoorStatusStore doorStatusStore,
    IDeviceCommandService commandService) : IDoorAccessService
{
    private const string WrongPin = "Wrong PIN.";
    private const string DoorOffline = "The door is offline right now.";

    public Task<bool> IsDoorOnlineAsync() => doorStatusStore.IsOnlineAsync();

    public async Task<ServiceResult<DeviceCommand>> UnlockWithPinAsync(string pin, CancellationToken cancellationToken)
    {
        // Checked before the PIN so a guess isn't used up on an offline door.
        if (!await doorStatusStore.IsOnlineAsync())
        {
            return ServiceResult<DeviceCommand>.Conflict(DoorOffline);
        }

        var member = await FindMemberByPinAsync(pin, cancellationToken);
        if (member is null)
        {
            return ServiceResult<DeviceCommand>.Invalid(WrongPin);
        }

        return ServiceResult<DeviceCommand>.Ok(
            await commandService.QueueUnlockAsync(member, AccessMethod.AppPin, cancellationToken));
    }

    public async Task<ServiceResult<DeviceCommand>> UnlockForMemberAsync(
        Member member,
        AccessMethod method,
        CancellationToken cancellationToken)
    {
        if (!await doorStatusStore.IsOnlineAsync())
        {
            return ServiceResult<DeviceCommand>.Conflict(DoorOffline);
        }

        return ServiceResult<DeviceCommand>.Ok(
            await commandService.QueueUnlockAsync(member, method, cancellationToken));
    }

    public async Task<ServiceResult<DeviceCommand>> GetUnlockAsync(Guid id, CancellationToken cancellationToken)
    {
        var result = await commandService.GetAsync(id, cancellationToken);
        return result.Value is { Type: CommandType.Unlock }
            ? result
            : ServiceResult<DeviceCommand>.NotFound("Unlock not found.");
    }

    public async Task<Member?> FindMemberByPinAsync(string pin, CancellationToken cancellationToken)
    {
        if (PinRules.IsValid(pin))
        {
            // Salts differ per member, so each PIN has to be checked in turn.
            var candidates = await dbContext.Members
                .AsNoTracking()
                .Where(m => m.PinSalt != null && m.PinHash != null)
                .ToListAsync(cancellationToken);

            var match = candidates.FirstOrDefault(m => pinHasher.Verify(pin, m.PinSalt!, m.PinHash!));
            if (match is { Enabled: true })
            {
                return match;
            }

            if (match is not null)
            {
                await RecordDeniedAsync(match, cancellationToken);
                return null;
            }
        }

        await RecordDeniedAsync(null, cancellationToken);
        return null;
    }

    private async Task RecordDeniedAsync(Member? member, CancellationToken cancellationToken)
    {
        dbContext.AccessEvents.Add(new AccessEvent
        {
            Id = Guid.NewGuid(),
            Type = AccessEventType.Denied,
            Method = AccessMethod.AppPin,
            MemberId = member?.Id,
            MemberName = member?.Name,
            OccurredAt = DateTimeOffset.UtcNow,
        });
        await dbContext.SaveChangesAsync(cancellationToken);
    }
}
