using SmartDoor.Api.Models;

namespace SmartDoor.Api.Contracts;

// ---- Door controller -> backend ----

public sealed record HeartbeatRequest(
    bool DoorOpen,
    bool Locked,
    bool FingerprintReady,
    int TemplateCount,
    string? FirmwareVersion,
    string? IpAddress,
    int? Rssi,
    long UptimeMs);

// AgeMs = how long ago the event happened on the door (it has no real clock),
// so a batch sent late after a network drop still gets the right time.
public sealed record DeviceEvent(
    AccessEventType Type,
    AccessMethod Method,
    Guid? MemberId,
    int? FingerprintSlot,
    long AgeMs);

public sealed record DeviceEventBatch(IReadOnlyList<DeviceEvent> Events);

public sealed record DeviceCommandUpdate(CommandStatus Status, string? Step, string? Message);

// ---- Backend -> door controller ----

public sealed record DeviceCommandDto(Guid Id, CommandType Type, int? Slot)
{
    public static DeviceCommandDto From(DeviceCommand command) => new(command.Id, command.Type, command.Slot);
}

public sealed record HeartbeatResponse(string AccessListVersion, IReadOnlyList<DeviceCommandDto> Commands);

public sealed record AccessListPin(Guid MemberId, string Salt, string Hash);

public sealed record AccessList(
    string Version,
    IReadOnlyList<AccessListPin> Pins,
    IReadOnlyList<int> FingerprintSlots);
