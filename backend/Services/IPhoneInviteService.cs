namespace SmartDoor.Api.Services;

public sealed record PhoneInvite(string Token, Guid MemberId, string MemberName, DateTimeOffset ExpiresAt);

// One-time links an admin sends so a person can set up fingerprint unlock on
// their own phone (the fingerprint can only be registered on that phone).
public interface IPhoneInviteService
{
    Task<ServiceResult<PhoneInvite>> CreateAsync(Guid memberId, CancellationToken cancellationToken);
    Task<ServiceResult<PhoneInvite>> GetAsync(string token);
    Task RevokeAsync(string token);
}
