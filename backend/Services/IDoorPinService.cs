using SmartDoor.Api.Models;

namespace SmartDoor.Api.Services;

// Each door's PIN (one PIN for everyone at that door — on its keypad and in
// the app).
public interface IDoorPinService
{
    Task<ServiceResult<Door>> SetAsync(Guid doorId, string pin, CancellationToken cancellationToken);
    Task<ServiceResult<Door>> ClearAsync(Guid doorId, CancellationToken cancellationToken);
    Task<bool> VerifyAsync(Guid doorId, string pin, CancellationToken cancellationToken);
}
