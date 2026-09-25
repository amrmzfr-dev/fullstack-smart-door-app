namespace SmartDoor.Api.Models;

// A person allowed through the door by fingerprint (on the door's sensor, or
// their phone's reader). PINs aren't per person — there's one door PIN, see
// DoorSettings.
public class Member
{
    public Guid Id { get; set; }
    public required string Name { get; set; }
    public bool Enabled { get; set; } = true;

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public List<Fingerprint> Fingerprints { get; set; } = [];
    public List<PhoneKey> PhoneKeys { get; set; } = [];
}
