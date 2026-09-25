using SmartDoor.Api.Models;

namespace SmartDoor.Api.Services;

public interface IMemberService
{
    Task<IReadOnlyList<Member>> ListAsync(CancellationToken cancellationToken);
    Task<ServiceResult<Member>> CreateAsync(string name, string? pin, CancellationToken cancellationToken);
    Task<ServiceResult<Member>> UpdateAsync(Guid id, string name, bool enabled, CancellationToken cancellationToken);
    Task<ServiceResult<Member>> SetPinAsync(Guid id, string pin, CancellationToken cancellationToken);
    Task<ServiceResult<Member>> ClearPinAsync(Guid id, CancellationToken cancellationToken);
    Task<ServiceResult<bool>> DeleteAsync(Guid id, string deletedBy, CancellationToken cancellationToken);
}
