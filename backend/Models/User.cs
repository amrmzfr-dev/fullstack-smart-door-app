namespace SmartDoor.Api.Models;

// A web-app login (an admin who manages the door) — not someone who opens it.
public class User
{
    public Guid Id { get; set; }
    public required string Username { get; set; }
    public required string PasswordHash { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
}
