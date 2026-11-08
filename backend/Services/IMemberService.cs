using SmartDoor.Api.Models;

namespace SmartDoor.Api.Services;

public interface IMemberService
{
    Task<IReadOnlyList<Member>> ListAsync(CancellationToken cancellationToken);
    Task<ServiceResult<Member>> CreateAsync(string name, string? username, string? password, CancellationToken cancellationToken);

    // Create the person's sign-in, or change its username / password (a null
    // password keeps the current one).
    Task<ServiceResult<Member>> SetAccountAsync(Guid id, string username, string? password, CancellationToken cancellationToken);
    Task<ServiceResult<Member>> ClearAccountAsync(Guid id, CancellationToken cancellationToken);
    Task<ServiceResult<Member>> UpdateAsync(Guid id, string name, bool enabled, CancellationToken cancellationToken);
    Task<ServiceResult<Member>> SetDoorsAsync(Guid id, IReadOnlyList<Guid> doorIds, CancellationToken cancellationToken);
    Task<ServiceResult<bool>> DeleteAsync(Guid id, string deletedBy, CancellationToken cancellationToken);
}
