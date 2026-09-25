namespace SmartDoor.Api.Models;

// A person allowed through the door, by keypad PIN, fingerprint, or their
// phone's fingerprint reader.
public class Member
{
    public Guid Id { get; set; }
    public required string Name { get; set; }
    public bool Enabled { get; set; } = true;

    // SHA-256(salt + pin) as lowercase hex. The door controller checks PINs
    // offline against this same hash (see AccessListService), so the plain
    // PIN is never stored or sent anywhere.
    public string? PinSalt { get; set; }
    public string? PinHash { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public List<Fingerprint> Fingerprints { get; set; } = [];
    public List<PhoneKey> PhoneKeys { get; set; } = [];
}
