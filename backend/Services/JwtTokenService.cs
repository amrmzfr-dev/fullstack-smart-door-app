using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Microsoft.IdentityModel.Tokens;

namespace SmartDoor.Api.Services;

public class JwtTokenService(IConfiguration configuration) : IJwtTokenService
{
    public string GenerateToken(Guid userId, string username) => Generate(userId, username, null);

    public string GenerateMemberToken(Guid memberId, string username) => Generate(memberId, username, MemberRole);

    public const string MemberRole = "member";

    private const int MemberAdminExpiryMinutes = 24 * 60;

    public string GenerateAdminTokenForMember(Guid memberId, string username) =>
        Generate(memberId, username, null, MemberAdminExpiryMinutes);

    private string Generate(Guid userId, string username, string? role, int? expiryOverrideMinutes = null)
    {
        var key = configuration["Jwt:Key"]
            ?? throw new InvalidOperationException("Jwt:Key is not configured.");
        var issuer = configuration["Jwt:Issuer"] ?? "smart-door";
        var audience = configuration["Jwt:Audience"] ?? "smart-door";
        // No forced re-login — a device stays signed in until the user logs out
        // or the browser's localStorage is cleared.
        var expiryMinutes = expiryOverrideMinutes ?? configuration.GetValue<int?>("Jwt:ExpiryMinutes") ?? 525600;

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, userId.ToString()),
            new(JwtRegisteredClaimNames.UniqueName, username),
            new(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString()),
        };
        if (role is not null)
        {
            claims.Add(new Claim("role", role));
        }

        var signingKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(key));
        var credentials = new SigningCredentials(signingKey, SecurityAlgorithms.HmacSha256);

        var token = new JwtSecurityToken(
            issuer: issuer,
            audience: audience,
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(expiryMinutes),
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}
