using SmartDoor.Api.Models;

namespace SmartDoor.Api.Contracts;

public sealed record CreateMemberRequest(string Name, string? Username = null, string? Password = null);
public sealed record SetMemberAccountRequest(string Username, string? Password);
public sealed record UpdateMemberRequest(string Name, bool Enabled);
public sealed record SetMemberDoorsRequest(IReadOnlyList<Guid> DoorIds);

public sealed record FingerprintResponse(Guid Id, Guid DoorId, int Slot, string Label, DateTimeOffset EnrolledAt)
{
    public static FingerprintResponse From(Fingerprint fingerprint) =>
        new(fingerprint.Id, fingerprint.DoorId, fingerprint.Slot, fingerprint.Label, fingerprint.EnrolledAt);
}

public sealed record MemberResponse(
    Guid Id,
    string Name,
    bool Enabled,
    IReadOnlyList<Guid> DoorIds,
    IReadOnlyList<FingerprintResponse> Fingerprints,
    IReadOnlyList<PhoneKeyResponse> Phones,
    DateTimeOffset CreatedAt,
    string? Username,
    string? PasswordHint,
    DateTimeOffset? AccountCreatedAt,
    DateTimeOffset? LastLoginAt)
{
    public static MemberResponse From(Member member) =>
        new(
            member.Id,
            member.Name,
            member.Enabled,
            member.Doors.Select(md => md.DoorId).ToList(),
            member.Fingerprints
                .OrderBy(f => f.EnrolledAt)
                .Select(FingerprintResponse.From)
                .ToList(),
            member.PhoneKeys
                .OrderBy(k => k.CreatedAt)
                .Select(PhoneKeyResponse.From)
                .ToList(),
            member.CreatedAt,
            member.Username,
            member.PasswordHint,
            member.AccountCreatedAt,
            member.LastLoginAt);
}
