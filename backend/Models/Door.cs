namespace SmartDoor.Api.Models;

// One door controller (ESP32) and its lock. Each door has its own secret key
// (the firmware's DEVICE_API_KEY), its own PIN and its own fingerprint sensor.
public class Door
{
    // The door that existed before multi-door support; all older data (PIN,
    // fingerprints, commands, log) was moved onto it.
    public static readonly Guid MainDoorId = new("00000000-0000-0000-0000-000000000001");

    public Guid Id { get; set; }
    public required string Name { get; set; }

    // SHA-256 of the door's device key (lowercase hex). The key itself is shown
    // once when the door is added and never stored.
    public string? KeyHash { get; set; }

    // This door's PIN, as SHA-256(salt + pin) lowercase hex. The controller
    // checks it offline against the same hash (see AccessListService), so the
    // plain PIN is never stored or sent anywhere.
    public string? PinSalt { get; set; }
    public string? PinHash { get; set; }
    public DateTimeOffset? PinUpdatedAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

// Which doors a person may open (by fingerprint or phone).
public class MemberDoor
{
    public Guid MemberId { get; set; }
    public Guid DoorId { get; set; }
}
