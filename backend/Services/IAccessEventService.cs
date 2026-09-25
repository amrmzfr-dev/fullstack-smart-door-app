using SmartDoor.Api.Contracts;
using SmartDoor.Api.Models;

namespace SmartDoor.Api.Services;

public interface IAccessEventService
{
    Task RecordDeviceEventsAsync(IReadOnlyList<DeviceEvent> events, CancellationToken cancellationToken);
    Task<IReadOnlyList<AccessEvent>> ListAsync(int limit, CancellationToken cancellationToken);
}
