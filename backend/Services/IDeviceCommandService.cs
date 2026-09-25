using SmartDoor.Api.Contracts;
using SmartDoor.Api.Models;

namespace SmartDoor.Api.Services;

public interface IDeviceCommandService
{
    // Queues an unlock for a member who has already proved who they are (app
    // PIN or phone fingerprint). The caller checks the door is online first.
    Task<DeviceCommand> QueueUnlockAsync(Member member, AccessMethod method, CancellationToken cancellationToken);
    Task<ServiceResult<DeviceCommand>> GetAsync(Guid id, CancellationToken cancellationToken);
    Task<ServiceResult<DeviceCommand>> CancelAsync(Guid id, CancellationToken cancellationToken);

    // Adds to the change tracker only — the caller saves, so it can be part of
    // a bigger change (e.g. deleting a member and all their fingerprints).
    DeviceCommand AddDeleteFingerprint(int slot, string createdBy);

    Task<IReadOnlyList<DeviceCommand>> TakePendingForDeviceAsync(CancellationToken cancellationToken);
    Task<ServiceResult<DeviceCommand>> ApplyDeviceUpdateAsync(
        Guid id,
        DeviceCommandUpdate update,
        CancellationToken cancellationToken);
}
