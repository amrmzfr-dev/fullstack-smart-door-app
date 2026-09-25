namespace SmartDoor.Api.Models;

public enum AccessEventType
{
    Granted,
    Denied,
    ForcedOpen,
    LeftOpen,
    DoorOpened,
    DoorClosed,
}

public enum AccessMethod
{
    None,
    Keypad,
    Fingerprint,
    ExitButton,
    Remote,
    AppPin,
    PhoneFingerprint,
}

public class AccessEvent
{
    public Guid Id { get; set; }
    public AccessEventType Type { get; set; }
    public AccessMethod Method { get; set; }

    // Name is copied at record time so the log still reads right after a
    // member is renamed or deleted. No FK on purpose for the same reason.
    public Guid? MemberId { get; set; }
    public string? MemberName { get; set; }

    // Web-app user behind a remote unlock (older log rows only).
    public string? Username { get; set; }
    public int? FingerprintSlot { get; set; }

    public DateTimeOffset OccurredAt { get; set; }
    public DateTimeOffset ReceivedAt { get; set; } = DateTimeOffset.UtcNow;
}
