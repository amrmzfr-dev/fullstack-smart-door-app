using SmartDoor.Api.Models;

namespace SmartDoor.Api.Contracts;

public sealed record CreateMemberRequest(string Name, string? Pin);
public sealed record UpdateMemberRequest(string Name, bool Enabled);
public sealed record SetPinRequest(string Pin);

public sealed record FingerprintResponse(Guid Id, int Slot, string Label, DateTimeOffset EnrolledAt)
{
    public static FingerprintResponse From(Fingerprint fingerprint) =>
        new(fingerprint.Id, fingerprint.Slot, fingerprint.Label, fingerprint.EnrolledAt);
}

public sealed record MemberResponse(
    Guid Id,
    string Name,
    bool Enabled,
    bool HasPin,
    IReadOnlyList<FingerprintResponse> Fingerprints,
    IReadOnlyList<PhoneKeyResponse> Phones,
    DateTimeOffset CreatedAt)
{
    public static MemberResponse From(Member member) =>
        new(
            member.Id,
            member.Name,
            member.Enabled,
            member.PinHash is not null,
            member.Fingerprints
                .OrderBy(f => f.EnrolledAt)
                .Select(FingerprintResponse.From)
                .ToList(),
            member.PhoneKeys
                .OrderBy(k => k.CreatedAt)
                .Select(PhoneKeyResponse.From)
                .ToList(),
            member.CreatedAt);
}
