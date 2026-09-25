namespace SmartDoor.Api.Models;

// A phone's built-in fingerprint / face unlock registered to a member
// (a WebAuthn passkey). The phone keeps the private key; we keep the public
// key and check each unlock's signature against it.
public class PhoneKey
{
    public Guid Id { get; set; }
    public Guid MemberId { get; set; }
    public Member? Member { get; set; }
    public required byte[] CredentialId { get; set; }
    public required byte[] PublicKey { get; set; }

    // Goes up on every use; a lower number than last time means a cloned key.
    public long SignCount { get; set; }
    public required string Label { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset? LastUsedAt { get; set; }
}
