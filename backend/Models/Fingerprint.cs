namespace SmartDoor.Api.Models;

// One template stored on the AS608 sensor. Slot is the sensor's own template
// ID (1..FingerprintSlots.Max), which is what the door reports on a match.
public class Fingerprint
{
    public Guid Id { get; set; }
    public Guid MemberId { get; set; }
    public Member? Member { get; set; }
    public int Slot { get; set; }
    public required string Label { get; set; }
    public DateTimeOffset EnrolledAt { get; set; } = DateTimeOffset.UtcNow;
}

public static class FingerprintSlots
{
    public const int Min = 1;
    public const int Max = 127;
}
