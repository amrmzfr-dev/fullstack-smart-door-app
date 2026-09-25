using SmartDoor.Api.Models;

namespace SmartDoor.Api.Services;

public interface IDoorStatusStore
{
    Task SaveAsync(DoorStatusSnapshot snapshot);
    Task<DoorStatusSnapshot?> GetAsync();
    Task<bool> IsOnlineAsync();

    // The door's MQTT connection dropped (broker sent its last will): offline
    // right away instead of waiting for reports to go stale. The last snapshot
    // is kept so "last seen" still shows.
    Task MarkOfflineAsync();
}
