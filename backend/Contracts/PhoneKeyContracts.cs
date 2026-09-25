using System.Text.Json;
using SmartDoor.Api.Models;

namespace SmartDoor.Api.Contracts;

public sealed record CreatePhoneInviteRequest(Guid MemberId);

public sealed record PhoneInviteResponse(string Token, DateTimeOffset ExpiresAt);

// What the phone shows before scanning. Only the name — nothing else.
public sealed record PhoneInviteInfoResponse(string MemberName, DateTimeOffset ExpiresAt);

public sealed record FinishPhoneSetupRequest(Guid FlowId, string? Label, JsonElement Credential);

public sealed record PhoneSetupResponse(Guid Id, string Label);

public sealed record PhoneKeyResponse(Guid Id, string Label, DateTimeOffset CreatedAt, DateTimeOffset? LastUsedAt)
{
    public static PhoneKeyResponse From(PhoneKey key) => new(key.Id, key.Label, key.CreatedAt, key.LastUsedAt);
}
