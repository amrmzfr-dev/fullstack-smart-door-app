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
    private const string DoorOffline = "The door is offline right now.";

    public Task<bool> IsDoorOnlineAsync() => doorStatusStore.IsOnlineAsync();

    public async Task<ServiceResult<DeviceCommand>> UnlockWithPinAsync(string pin, CancellationToken cancellationToken)
    {
        // Checked before the PIN so a guess isn't used up on an offline door.
        if (!await doorStatusStore.IsOnlineAsync())
        {
            return ServiceResult<DeviceCommand>.Conflict(DoorOffline);
        }

        if (!await doorPinService.VerifyAsync(pin, cancellationToken))
        {
            // Logged so wrong guesses show up in the admin log.
            dbContext.AccessEvents.Add(new AccessEvent
            {
                Id = Guid.NewGuid(),
                Type = AccessEventType.Denied,
                Method = AccessMethod.AppPin,
                OccurredAt = DateTimeOffset.UtcNow,
            });
            await dbContext.SaveChangesAsync(cancellationToken);
            return ServiceResult<DeviceCommand>.Invalid(WrongPin);
        }

        return ServiceResult<DeviceCommand>.Ok(
            await commandService.QueueUnlockAsync(null, AccessMethod.AppPin, cancellationToken));
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
}
