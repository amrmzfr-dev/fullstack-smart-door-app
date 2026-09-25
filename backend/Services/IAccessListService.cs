using SmartDoor.Api.Contracts;

namespace SmartDoor.Api.Services;

public interface IAccessListService
{
    Task<AccessList> BuildAsync(CancellationToken cancellationToken);
}
