using SmartDoor.Api.Models;

namespace SmartDoor.Api.Services;

// Opening a door from the public keypad app: no login, that door's PIN (or a
// registered phone's fingerprint, see IPhoneKeyService) is the proof.
public interface IDoorAccessService
{
    Task<ServiceResult<DeviceCommand>> UnlockWithPinAsync(Guid doorId, string pin, CancellationToken cancellationToken);

    // After a phone fingerprint proved who it is; checks they may open this door.
    Task<ServiceResult<DeviceCommand>> UnlockForMemberAsync(
        Guid doorId,
        Member member,
        AccessMethod method,
        CancellationToken cancellationToken);

    // A signed-in person pressing Unlock. Asks for the door's PIN only when
    // that door is set to require it.
    Task<ServiceResult<DeviceCommand>> UnlockForAccountAsync(
        Guid doorId,
        Member member,
        string? pin,
        GeoPoint? location,
        CancellationToken cancellationToken);

    Task<ServiceResult<DeviceCommand>> GetUnlockAsync(Guid id, CancellationToken cancellationToken);

    // Returns as soon as the unlock's status differs from `from` (or after a
    // few seconds with it unchanged) — lets the app follow the door instantly.
    Task<ServiceResult<DeviceCommand>> WaitForUnlockChangeAsync(
        Guid id,
        CommandStatus from,
        CancellationToken cancellationToken);
}
