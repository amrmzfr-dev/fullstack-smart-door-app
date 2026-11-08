namespace SmartDoor.Api.Services;

public interface IJwtTokenService
{
    string GenerateToken(Guid userId, string username);

    // A person's own account (role "member"): can only use the member portal.
    string GenerateMemberToken(Guid memberId, string username);
}
