namespace SmartDoor.Api.Models;

// A web-app login (an admin who manages the door) — not someone who opens it.
public class User
{
    public Guid Id { get; set; }
    public required string Username { get; set; }
    public required string PasswordHash { get; set; }

    // A reminder of the password for its owner, e.g. "sh*******26" (first two
    // and last two characters). Set when the password is changed, or at the
    // next login for accounts created before this existed. The password
    // itself is only ever stored as a hash.
    public string? PasswordHint { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
