using System.Text.Json;
using SmartDoor.Api.Models;
using StackExchange.Redis;

namespace SmartDoor.Api.Services;

public class RedisDoorStatusStore(IConnectionMultiplexer redis) : IDoorStatusStore
{
    // Over MQTT a door reports on every change and every few seconds (over
    // REST, every half second); nothing for this long means offline.
    public static readonly TimeSpan OnlineWindow = TimeSpan.FromSeconds(10);

    private static string StatusKey(Guid doorId) => $"smartdoor:status:{doorId}";
    private static string OfflineKey(Guid doorId) => $"smartdoor:status:{doorId}:offline";

    public async Task SaveAsync(Guid doorId, DoorStatusSnapshot snapshot)
    {
        var db = redis.GetDatabase();
        await db.StringSetAsync(StatusKey(doorId), JsonSerializer.Serialize(snapshot));
        await db.KeyDeleteAsync(OfflineKey(doorId));
    }

    public async Task<DoorStatusSnapshot?> GetAsync(Guid doorId)
    {
        var value = await redis.GetDatabase().StringGetAsync(StatusKey(doorId));
        return value.IsNullOrEmpty ? null : JsonSerializer.Deserialize<DoorStatusSnapshot>(value.ToString());
    }

    public async Task<bool> IsOnlineAsync(Guid doorId)
    {
        var snapshot = await GetAsync(doorId);
        return snapshot is not null
               && DateTimeOffset.UtcNow - snapshot.LastSeenAt <= OnlineWindow
               && !await redis.GetDatabase().KeyExistsAsync(OfflineKey(doorId));
    }

    public async Task MarkOfflineAsync(Guid doorId)
    {
        await redis.GetDatabase().StringSetAsync(OfflineKey(doorId), "1");
    }
}
