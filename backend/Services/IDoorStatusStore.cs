using SmartDoor.Api.Models;

namespace SmartDoor.Api.Services;

// Latest state each door controller reported, kept in Redis per door.
public interface IDoorStatusStore
{
    Task SaveAsync(Guid doorId, DoorStatusSnapshot snapshot);
    Task<DoorStatusSnapshot?> GetAsync(Guid doorId);
    Task<bool> IsOnlineAsync(Guid doorId);

    // The door's MQTT connection dropped (broker sent its last will): offline
    // right away instead of waiting for reports to go stale. The last snapshot
    // is kept so "last seen" still shows.
    Task MarkOfflineAsync(Guid doorId);
}
