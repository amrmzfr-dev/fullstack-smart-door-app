namespace SmartDoor.Api.Models;

// Last heartbeat from the door controller, kept in Redis.
public sealed record DoorStatusSnapshot(
    bool DoorOpen,
    bool Locked,
    bool FingerprintReady,
    int TemplateCount,
    string? FirmwareVersion,
    string? IpAddress,
    int? Rssi,
    long UptimeMs,
    DateTimeOffset LastSeenAt);
