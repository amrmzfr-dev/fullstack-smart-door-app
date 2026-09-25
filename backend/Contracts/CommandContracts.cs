using SmartDoor.Api.Models;

namespace SmartDoor.Api.Contracts;

public sealed record CommandResponse(
    Guid Id,
    CommandType Type,
    CommandStatus Status,
    int? Slot,
    string? Step,
    string? Message,
    DateTimeOffset CreatedAt,
    DateTimeOffset UpdatedAt)
{
    public static CommandResponse From(DeviceCommand command) =>
        new(
            command.Id,
            command.Type,
            command.Status,
            command.Slot,
            command.Step,
            command.Message,
            command.CreatedAt,
            command.UpdatedAt);
}
