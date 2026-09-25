namespace SmartDoor.Api.Models;

public enum CommandType
{
    Unlock,
    EnrollFingerprint,
    DeleteFingerprint,
}

public enum CommandStatus
{
    Pending,
    Sent,
    InProgress,
    Succeeded,
    Failed,
    Expired,
    Cancelled,
}

// A job for the door controller. The door has no inbound connection, so it
// picks these up from its heartbeat reply and reports progress back over REST.
public class DeviceCommand
{
    public Guid Id { get; set; }
    public CommandType Type { get; set; }
    public CommandStatus Status { get; set; } = CommandStatus.Pending;

    // The door (controller) this command is for.
    public Guid DoorId { get; set; }

    public int? Slot { get; set; }
    public Guid? MemberId { get; set; }

    // For an unlock: how the person proved who they are (app PIN / phone
    // fingerprint). Copied onto the log entry once the door confirms.
    public AccessMethod? Method { get; set; }
    public string? Label { get; set; }

    // Latest enrollment step the door reported (place_finger, remove_finger, ...).
    public string? Step { get; set; }
    public string? Message { get; set; }

    public required string CreatedBy { get; set; }
    public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    public DateTimeOffset UpdatedAt { get; set; } = DateTimeOffset.UtcNow;

    public bool IsActive =>
        Status is CommandStatus.Pending or CommandStatus.Sent or CommandStatus.InProgress;
}
