namespace SmartDoor.Api.Contracts;

public sealed record DoorStatusResponse(
    bool Online,
    DateTimeOffset? LastSeenAt,
    bool? DoorOpen,
    bool? Locked,
    bool? FingerprintReady,
    int? TemplateCount,
    string? FirmwareVersion,
    string? IpAddress,
    int? Rssi);
