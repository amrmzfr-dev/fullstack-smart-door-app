using SmartDoor.Api.Models;

namespace SmartDoor.Api.Services;

// Opening the door from the public keypad app: no login, the door PIN (or a
// registered phone's fingerprint, see IPhoneKeyService) is the proof.
public interface IDoorAccessService
{
    Task<bool> IsDoorOnlineAsync();
    Task<ServiceResult<DeviceCommand>> UnlockWithPinAsync(string pin, CancellationToken cancellationToken);
    Task<ServiceResult<DeviceCommand>> UnlockForMemberAsync(
        Member member,
        AccessMethod method,
        CancellationToken cancellationToken);
    Task<ServiceResult<DeviceCommand>> GetUnlockAsync(Guid id, CancellationToken cancellationToken);
}
