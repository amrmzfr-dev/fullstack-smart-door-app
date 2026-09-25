using System.Text.Json;
using SmartDoor.Api.Models;
using StackExchange.Redis;

namespace SmartDoor.Api.Services;

public class RedisDoorStatusStore(IConnectionMultiplexer redis) : IDoorStatusStore
{
    private const string StatusKey = "smartdoor:status";
    private const string OfflineKey = "smartdoor:status:offline";

    // Over MQTT the door reports on every change and every few seconds (over
    // REST, every couple of seconds); nothing for this long means offline.
    public static readonly TimeSpan OnlineWindow = TimeSpan.FromSeconds(10);

    public async Task SaveAsync(DoorStatusSnapshot snapshot)
    {
        var db = redis.GetDatabase();
        await db.StringSetAsync(StatusKey, JsonSerializer.Serialize(snapshot));
        await db.KeyDeleteAsync(OfflineKey);
    }

    public async Task<DoorStatusSnapshot?> GetAsync()
    {
        var value = await redis.GetDatabase().StringGetAsync(StatusKey);
        return value.IsNullOrEmpty ? null : JsonSerializer.Deserialize<DoorStatusSnapshot>(value.ToString());
    }

    public async Task<bool> IsOnlineAsync()
    {
        var snapshot = await GetAsync();
        return snapshot is not null
               && DateTimeOffset.UtcNow - snapshot.LastSeenAt <= OnlineWindow
               && !await redis.GetDatabase().KeyExistsAsync(OfflineKey);
    }

    public async Task MarkOfflineAsync()
    {
        await redis.GetDatabase().StringSetAsync(OfflineKey, "1");
    }
}
