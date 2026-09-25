using SmartDoor.Api.Models;

namespace SmartDoor.Api.Contracts;

public sealed record SetDoorPinRequest(string Pin);

// Never the PIN itself — only whether one is set and when it last changed.
public sealed record DoorPinResponse(bool IsSet, DateTimeOffset? UpdatedAt)
{
    public static DoorPinResponse From(DoorSettings settings) =>
        new(settings.PinHash is not null, settings.PinUpdatedAt);
}
