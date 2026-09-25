using SmartDoor.Api.Models;

namespace SmartDoor.Api.Mqtt;

// Must match the topics in firmware/door-controller/src/door_link.cpp and the
// broker's ACL (mosquitto/acl): the door may only read Command/Access and
// write Status/Report/Online.
public static class DoorMqttTopics
{
    // backend -> door: one command per message ({ id, type, slot }).
    public const string Command = "smartdoor/door/cmd";

    // backend -> door, retained: current access-list version. The door
    // downloads the list over REST when it differs from its own.
    public const string Access = "smartdoor/door/access";

    // door -> backend: same fields as the REST heartbeat, sent on every change.
    public const string Status = "smartdoor/door/status";

    // door -> backend: command progress / result ({ id, status, step, message }).
    public const string Report = "smartdoor/door/report";

    // door -> backend, retained: "1" on connect; the broker publishes the
    // door's last will "0" the moment the connection drops.
    public const string Online = "smartdoor/door/online";
}

public sealed record MqttCommandReport(Guid Id, CommandStatus Status, string? Step, string? Message);
