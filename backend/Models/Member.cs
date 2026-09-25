namespace SmartDoor.Api.Models;

// A person allowed through some doors by fingerprint (on a door's sensor, or
// their phone's reader). PINs aren't per person — each door has one PIN.
public class Member
{
    public Guid Id { get; set; }
    public required string Name { get; set; }
    public bool Enabled { get; set; } = true;

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public List<Fingerprint> Fingerprints { get; set; } = [];
    public List<PhoneKey> PhoneKeys { get; set; } = [];

    // Doors this person may open.
    public List<MemberDoor> Doors { get; set; } = [];
}
