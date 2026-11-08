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

    // On: a signed-in person must type this door's PIN to open it from their
    // account. Off: they just press Unlock. (The door's own keypad and the
    // public keypad app always use the PIN.)
    public bool PinRequired { get; set; } = true;

    // Weekly "open hours": while the schedule is on, the door stays unlocked
    // between From and Until on the chosen days, then locks and needs a PIN /
    // fingerprint / phone again. The controller keeps the clock itself (NTP),
    // so it works offline. Minutes are since midnight in the door's local time;
    // Days is a bit mask, Monday = bit 0 ... Sunday = bit 6.
    public bool ScheduleEnabled { get; set; }
    public int ScheduleFromMinutes { get; set; } = 7 * 60;
    public int ScheduleUntilMinutes { get; set; } = 19 * 60;
    public int ScheduleDays { get; set; } = 0b0011111;  // Monday to Friday
    public int ScheduleUtcOffsetMinutes { get; set; } = 8 * 60;  // Malaysia

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}

// Which doors a person may open (by fingerprint or phone).
public class MemberDoor
{
    public Guid MemberId { get; set; }
    public Guid DoorId { get; set; }
}
