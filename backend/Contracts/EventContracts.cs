using SmartDoor.Api.Models;

namespace SmartDoor.Api.Contracts;

public sealed record AccessEventResponse(
    Guid Id,
    AccessEventType Type,
    AccessMethod Method,
    Guid? MemberId,
    string? MemberName,
    string? Username,
    int? FingerprintSlot,
    DateTimeOffset OccurredAt)
{
    public static AccessEventResponse From(AccessEvent accessEvent) =>
        new(
            accessEvent.Id,
            accessEvent.Type,
            accessEvent.Method,
            accessEvent.MemberId,
            accessEvent.MemberName,
            accessEvent.Username,
            accessEvent.FingerprintSlot,
            accessEvent.OccurredAt);
}
