using SmartDoor.Api.Models;

namespace SmartDoor.Api.Services;

public interface IFingerprintService
{
    Task<ServiceResult<DeviceCommand>> StartEnrollmentAsync(
        Guid memberId,
        string? label,
        string createdBy,
        CancellationToken cancellationToken);

    Task<ServiceResult<bool>> DeleteAsync(Guid fingerprintId, string deletedBy, CancellationToken cancellationToken);
}
