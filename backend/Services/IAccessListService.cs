using SmartDoor.Api.Contracts;

namespace SmartDoor.Api.Services;

public interface IAccessListService
{
    Task<AccessList> BuildAsync(Guid doorId, CancellationToken cancellationToken);
}
