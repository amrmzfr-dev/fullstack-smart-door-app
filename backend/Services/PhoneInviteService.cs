using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using SmartDoor.Api.Data;
using StackExchange.Redis;

namespace SmartDoor.Api.Services;

// Invites live only in Redis and expire on their own; finishing a setup
// deletes the invite, so each link works once.
public class PhoneInviteService(AppDbContext dbContext, IConnectionMultiplexer redis) : IPhoneInviteService
{
    private const string KeyPrefix = "smartdoor:phone-invite:";
    private const int TokenBytes = 24;
    private static readonly TimeSpan Lifetime = TimeSpan.FromMinutes(15);

    private sealed record StoredInvite(Guid MemberId, string MemberName, DateTimeOffset ExpiresAt);

    public async Task<ServiceResult<PhoneInvite>> CreateAsync(Guid memberId, CancellationToken cancellationToken)
    {
        var member = await dbContext.Members
            .AsNoTracking()
            .FirstOrDefaultAsync(m => m.Id == memberId, cancellationToken);
        if (member is null)
        {
            return ServiceResult<PhoneInvite>.NotFound("Person not found.");
        }

        var token = Base64UrlToken();
        var stored = new StoredInvite(member.Id, member.Name, DateTimeOffset.UtcNow + Lifetime);
        await redis.GetDatabase().StringSetAsync(KeyPrefix + token, JsonSerializer.Serialize(stored), Lifetime);
        return ServiceResult<PhoneInvite>.Ok(new PhoneInvite(token, stored.MemberId, stored.MemberName, stored.ExpiresAt));
    }

    public async Task<ServiceResult<PhoneInvite>> GetAsync(string token)
    {
        var value = IsWellFormed(token) ? await redis.GetDatabase().StringGetAsync(KeyPrefix + token) : RedisValue.Null;
        var stored = value.IsNullOrEmpty ? null : JsonSerializer.Deserialize<StoredInvite>(value.ToString());
        return stored is null
            ? ServiceResult<PhoneInvite>.NotFound("This setup link has expired or was already used. Ask the admin for a new one.")
            : ServiceResult<PhoneInvite>.Ok(new PhoneInvite(token, stored.MemberId, stored.MemberName, stored.ExpiresAt));
    }

    public async Task RevokeAsync(string token)
    {
        if (IsWellFormed(token))
        {
            await redis.GetDatabase().KeyDeleteAsync(KeyPrefix + token);
        }
    }

    private static string Base64UrlToken() =>
        Convert.ToBase64String(RandomNumberGenerator.GetBytes(TokenBytes))
            .Replace('+', '-')
            .Replace('/', '_')
            .TrimEnd('=');

    private static bool IsWellFormed(string token) =>
        token.Length is > 0 and <= 64 && token.All(c => char.IsAsciiLetterOrDigit(c) || c is '-' or '_');
}
