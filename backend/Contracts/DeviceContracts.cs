using SmartDoor.Api.Models;
using SmartDoor.Api.Services;

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

// Path / Sha256 / Version are only filled for an update_firmware command: where
// the door downloads the file from (under the API base URL), the checksum it
// must match, and the version it will become.
public sealed record DeviceCommandDto(
    Guid Id,
    CommandType Type,
    int? Slot,
    string? Path = null,
    string? Sha256 = null,
    string? Version = null)
{
    public static DeviceCommandDto From(DeviceCommand command, IFirmwareStore firmwareStore)
    {
        if (command.Type == CommandType.UpdateFirmware && command.Label is string version
            && firmwareStore.Find(version) is { } file)
        {
            return new(command.Id, command.Type, null, $"/device/firmware/{file.Version}", file.Sha256, file.Version);
        }

        return new(command.Id, command.Type, command.Slot);
    }
}

public sealed record HeartbeatResponse(string AccessListVersion, IReadOnlyList<DeviceCommandDto> Commands);

public sealed record AccessListPin(Guid MemberId, string Salt, string Hash);

// Open hours the controller applies itself (it keeps time over NTP). Minutes
// since local midnight; Days is a bit mask (Monday = bit 0 ... Sunday = bit 6).
public sealed record AccessSchedule(bool Enabled, int From, int Until, int Days, int UtcOffsetMinutes);

public sealed record AccessList(
    string Version,
    IReadOnlyList<AccessListPin> Pins,
    IReadOnlyList<int> FingerprintSlots,
    AccessSchedule Schedule);
