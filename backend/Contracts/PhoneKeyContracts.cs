using System.Text.Json;
using SmartDoor.Api.Models;

namespace SmartDoor.Api.Contracts;

public sealed record StartPhoneSetupRequest(Guid MemberId);

public sealed record FinishPhoneSetupRequest(Guid FlowId, string? Label, JsonElement Credential);

public sealed record PhoneSetupResponse(Guid Id, string Label);

public sealed record PhoneKeyResponse(Guid Id, string Label, DateTimeOffset CreatedAt, DateTimeOffset? LastUsedAt)
{
    public static PhoneKeyResponse From(PhoneKey key) => new(key.Id, key.Label, key.CreatedAt, key.LastUsedAt);
}
