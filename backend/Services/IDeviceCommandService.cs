using SmartDoor.Api.Contracts;
using SmartDoor.Api.Models;

namespace SmartDoor.Api.Services;

public interface IDeviceCommandService
{
    // Queues an unlock for one door once the caller has checked the proof (door
    // PIN -> no member, phone fingerprint -> that member) and that it's online.
    Task<DeviceCommand> QueueUnlockAsync(
        Guid doorId,
        Member? member,
        AccessMethod method,
        CancellationToken cancellationToken);

    Task<ServiceResult<DeviceCommand>> GetAsync(Guid id, CancellationToken cancellationToken);
    Task<ServiceResult<DeviceCommand>> CancelAsync(Guid id, CancellationToken cancellationToken);

    // Adds to the change tracker only — the caller saves, so it can be part of
    // a bigger change (e.g. deleting a member and all their fingerprints).
    DeviceCommand AddDeleteFingerprint(Guid doorId, int slot, string createdBy);

    Task<IReadOnlyList<DeviceCommand>> TakePendingForDeviceAsync(Guid doorId, CancellationToken cancellationToken);

    // A door reporting progress on one of its own commands.
    Task<ServiceResult<DeviceCommand>> ApplyDeviceUpdateAsync(
        Guid doorId,
        Guid id,
        DeviceCommandUpdate update,
        CancellationToken cancellationToken);
}
