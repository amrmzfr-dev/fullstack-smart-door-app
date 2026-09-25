using SmartDoor.Api.Models;

namespace SmartDoor.Api.Services;

// DeviceKey is only ever returned here, right after the door is added.
public sealed record CreatedDoor(Door Door, string DeviceKey);

public interface IDoorService
{
    Task<IReadOnlyList<Door>> ListAsync(CancellationToken cancellationToken);
    Task<Door?> GetAsync(Guid id, CancellationToken cancellationToken);
    Task<ServiceResult<CreatedDoor>> CreateAsync(string name, CancellationToken cancellationToken);
    Task<ServiceResult<Door>> RenameAsync(Guid id, string name, CancellationToken cancellationToken);
    Task<ServiceResult<CreatedDoor>> ResetKeyAsync(Guid id, CancellationToken cancellationToken);
    Task<ServiceResult<bool>> DeleteAsync(Guid id, CancellationToken cancellationToken);

    // The door a controller's X-Device-Key belongs to, or null.
    Task<Door?> FindByKeyAsync(string key, CancellationToken cancellationToken);
}
