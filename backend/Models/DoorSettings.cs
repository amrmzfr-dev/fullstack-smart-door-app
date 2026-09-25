namespace SmartDoor.Api.Models;

// Door-wide settings — a single row (Id = DoorSettings.SingletonId).
public class DoorSettings
{
    public const int SingletonId = 1;

    public int Id { get; set; } = SingletonId;

    // The one PIN everyone uses, as SHA-256(salt + pin) lowercase hex. The door
    // controller checks it offline against this same hash (see
    // AccessListService), so the plain PIN is never stored or sent anywhere.
    public string? PinSalt { get; set; }
    public string? PinHash { get; set; }
    public DateTimeOffset? PinUpdatedAt { get; set; }
}
