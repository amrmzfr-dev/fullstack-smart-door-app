using SmartDoor.Api.Models;

namespace SmartDoor.Api.Services;

// Opening the door from the public keypad app: no login, the PIN (or phone
// fingerprint, see IPhoneKeyService) is the proof.
public interface IDoorAccessService
{
    Task<bool> IsDoorOnlineAsync();
    Task<ServiceResult<DeviceCommand>> UnlockWithPinAsync(string pin, CancellationToken cancellationToken);
    Task<ServiceResult<DeviceCommand>> UnlockForMemberAsync(
        Member member,
        AccessMethod method,
        CancellationToken cancellationToken);
    Task<ServiceResult<DeviceCommand>> GetUnlockAsync(Guid id, CancellationToken cancellationToken);

    // Enabled member whose PIN matches, or null. Records a denied attempt when
    // nobody matches, so wrong guesses show up in the admin log.
    Task<Member?> FindMemberByPinAsync(string pin, CancellationToken cancellationToken);
}
