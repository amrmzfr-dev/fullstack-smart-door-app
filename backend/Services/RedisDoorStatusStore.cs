using System.Text.Json;
using SmartDoor.Api.Models;
using StackExchange.Redis;

namespace SmartDoor.Api.Services;

public class RedisDoorStatusStore(IConnectionMultiplexer redis) : IDoorStatusStore
{
    private const string StatusKey = "smartdoor:status";

    // The door sends a heartbeat every 2s; a few missed in a row means offline.
    public static readonly TimeSpan OnlineWindow = TimeSpan.FromSeconds(10);

    public async Task SaveAsync(DoorStatusSnapshot snapshot)
    {
        await redis.GetDatabase().StringSetAsync(StatusKey, JsonSerializer.Serialize(snapshot));
    }

    public async Task<DoorStatusSnapshot?> GetAsync()
    {
        var value = await redis.GetDatabase().StringGetAsync(StatusKey);
        return value.IsNullOrEmpty ? null : JsonSerializer.Deserialize<DoorStatusSnapshot>(value.ToString());
    }

    public async Task<bool> IsOnlineAsync()
    {
        var snapshot = await GetAsync();
        return snapshot is not null && DateTimeOffset.UtcNow - snapshot.LastSeenAt <= OnlineWindow;
    }
}
