using SmartDoor.Api.Contracts;
using SmartDoor.Api.Models;

namespace SmartDoor.Api.Services;

public interface IAccessEventService
{
    Task RecordDeviceEventsAsync(Door door, IReadOnlyList<DeviceEvent> events, CancellationToken cancellationToken);
    Task<IReadOnlyList<AccessEvent>> ListAsync(int limit, CancellationToken cancellationToken);
    Task<IReadOnlyList<AccessEvent>> ListForMemberAsync(Guid memberId, int limit, CancellationToken cancellationToken);
}
