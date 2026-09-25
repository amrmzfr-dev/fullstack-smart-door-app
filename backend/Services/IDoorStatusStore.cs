using SmartDoor.Api.Models;

namespace SmartDoor.Api.Services;

public interface IDoorStatusStore
{
    Task SaveAsync(DoorStatusSnapshot snapshot);
    Task<DoorStatusSnapshot?> GetAsync();
    Task<bool> IsOnlineAsync();
}
