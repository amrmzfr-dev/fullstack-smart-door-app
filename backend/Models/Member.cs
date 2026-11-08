namespace SmartDoor.Api.Models;

// A person allowed through some doors by fingerprint (on a door's sensor, or
// their phone's reader). PINs aren't per person — each door has one PIN.
public class Member
{
    public Guid Id { get; set; }
    public required string Name { get; set; }
    public bool Enabled { get; set; } = true;

    // Optional web-app account: lets the person sign in on their phone and
    // open the doors they are allowed on (see MemberPortalController). The
    // password is only ever stored as a hash; PasswordHint is the on-screen
    // reminder, e.g. "sh*******26".
    public string? Username { get; set; }
    public string? PasswordHash { get; set; }
    public string? PasswordHint { get; set; }
    public DateTimeOffset? AccountCreatedAt { get; set; }
    public DateTimeOffset? LastLoginAt { get; set; }

    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public List<Fingerprint> Fingerprints { get; set; } = [];
    public List<PhoneKey> PhoneKeys { get; set; } = [];

    // Doors this person may open.
    public List<MemberDoor> Doors { get; set; } = [];
}
