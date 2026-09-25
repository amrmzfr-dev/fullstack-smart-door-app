using SmartDoor.Api.Models;

namespace SmartDoor.Api.Contracts;

public sealed record CreateDoorRequest(string Name);
public sealed record RenameDoorRequest(string Name);

// Admin view of a door: live state (null while offline / never seen) + PIN
// state. Never the PIN or key itself.
public sealed record DoorResponse(
    Guid Id,
    string Name,
    bool Online,
    DateTimeOffset? LastSeenAt,
    bool? DoorOpen,
    bool? Locked,
    bool? FingerprintReady,
    int? TemplateCount,
    string? FirmwareVersion,
    string? IpAddress,
    int? Rssi,
    bool PinSet,
    DateTimeOffset? PinUpdatedAt,
    DateTimeOffset CreatedAt)
{
    public static DoorResponse From(Door door, DoorStatusSnapshot? snapshot, bool online) =>
        new(
            door.Id,
            door.Name,
            online,
            snapshot?.LastSeenAt,
            snapshot?.DoorOpen,
            snapshot?.Locked,
            snapshot?.FingerprintReady,
            snapshot?.TemplateCount,
            snapshot?.FirmwareVersion,
            snapshot?.IpAddress,
            snapshot?.Rssi,
            door.PinHash is not null,
            door.PinUpdatedAt,
            door.CreatedAt);
}

// What goes into a door controller's secrets.h. Shown once, when the door is
// added (or its key is reset) — the key isn't stored and can't be shown again.
public sealed record DoorSetupResponse(
    DoorResponse Door,
    string DeviceKey,
    string? MqttHost,
    int? MqttPort,
    string? MqttPassword);

// Keypad app (public): just enough to pick a door and show its lock.
public sealed record PublicDoorResponse(Guid Id, string Name, bool Online, bool? DoorOpen, bool? Locked);
