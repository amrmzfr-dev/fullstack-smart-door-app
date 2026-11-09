namespace SmartDoor.Api.Services;

public interface IJwtTokenService
{
    string GenerateToken(Guid userId, string username);

    // A person's own account (role "member"): can only use the member portal.
    string GenerateMemberToken(Guid memberId, string username);

    // Full admin access for a person the admin trusted; expires after a day.
    string GenerateAdminTokenForMember(Guid memberId, string username);
}
