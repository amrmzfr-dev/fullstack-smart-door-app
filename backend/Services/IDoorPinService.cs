using SmartDoor.Api.Models;

namespace SmartDoor.Api.Services;

// The single door PIN shared by everyone (keypad on the door and the app).
public interface IDoorPinService
{
    Task<DoorSettings> GetAsync(CancellationToken cancellationToken);
    Task<ServiceResult<DoorSettings>> SetAsync(string pin, CancellationToken cancellationToken);
    Task<DoorSettings> ClearAsync(CancellationToken cancellationToken);
    Task<bool> VerifyAsync(string pin, CancellationToken cancellationToken);
}
