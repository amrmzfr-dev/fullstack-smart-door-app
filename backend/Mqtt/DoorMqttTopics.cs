using SmartDoor.Api.Models;

namespace SmartDoor.Api.Mqtt;

// smartdoor/door/{doorId}/{kind}. Must match firmware/door-controller/src/
// door_link.cpp and the broker's ACL (mosquitto/acl): doors may only read
// cmd/access and write status/report/online.
public static class DoorMqttTopics
{
    private const string Prefix = "smartdoor/door/";

    // backend -> door: one command per message ({ id, type, slot }).
    public static string Command(Guid doorId) => $"{Prefix}{doorId}/cmd";

    // backend -> door, retained: the door's current access-list version. The
    // door downloads the list over REST when it differs from its own.
    public static string Access(Guid doorId) => $"{Prefix}{doorId}/access";

    // door -> backend: same fields as the REST heartbeat, sent on every change.
    public const string StatusWildcard = Prefix + "+/status";

    // door -> backend: command progress / result ({ id, status, step, message }).
    public const string ReportWildcard = Prefix + "+/report";

    // door -> backend, retained: "1" on connect; the broker publishes the
    // door's last will "0" the moment the connection drops.
    public const string OnlineWildcard = Prefix + "+/online";

    // "smartdoor/door/{doorId}/{kind}" -> (doorId, kind), or null.
    public static (Guid DoorId, string Kind)? Parse(string topic)
    {
        var parts = topic.Split('/');
        return parts is ["smartdoor", "door", var id, var kind] && Guid.TryParse(id, out var doorId)
            ? (doorId, kind)
            : null;
    }
}

public sealed record MqttCommandReport(Guid Id, CommandStatus Status, string? Step, string? Message);
