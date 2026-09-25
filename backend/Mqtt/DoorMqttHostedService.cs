using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.Json.Serialization;
using MQTTnet;
using MQTTnet.Protocol;
using SmartDoor.Api.Contracts;
using SmartDoor.Api.Models;
using SmartDoor.Api.Services;

namespace SmartDoor.Api.Mqtt;

// Always-on link to every door through the MQTT broker:
//   - pushes queued commands to a door the moment they're created
//   - takes each door's status / command reports / online state as they happen
//   - publishes each door's access-list version (retained) so it re-syncs
// The REST device endpoints stay as a door's fallback when MQTT is down.
// Turned off when Mqtt:Host is not configured.
public sealed class DoorMqttHostedService(
    IServiceScopeFactory scopeFactory,
    IConfiguration configuration,
    IDoorStatusStore statusStore,
    IDoorCommandSignal commandSignal,
    ILogger<DoorMqttHostedService> logger) : BackgroundService
{
    private static readonly TimeSpan RoundInterval = TimeSpan.FromSeconds(1);
    private static readonly TimeSpan ReconnectDelay = TimeSpan.FromSeconds(5);

    // Same wire format as the REST API: camelCase, snake_case enums.
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower, allowIntegerValues: false) },
    };

    // Doors currently connected to the broker themselves (retained "online" =
    // "1"). Commands only go out over MQTT to these; any other door keeps
    // getting them through its REST heartbeat.
    private readonly ConcurrentDictionary<Guid, bool> doorsOnMqtt = new();
    private readonly Dictionary<Guid, string> publishedAccessVersions = [];

    // Door IDs that exist, refreshed every round — messages for anything else
    // are ignored.
    private volatile HashSet<Guid> knownDoors = [];

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        var host = configuration["Mqtt:Host"];
        if (string.IsNullOrWhiteSpace(host))
        {
            logger.LogInformation("Mqtt:Host not set — door link runs over REST only");
            return;
        }

        var port = configuration.GetValue("Mqtt:Port", 1883);
        var username = configuration["Mqtt:Username"];
        var password = configuration["Mqtt:Password"];

        var factory = new MqttClientFactory();
        using var client = factory.CreateMqttClient();
        client.ApplicationMessageReceivedAsync += args => HandleMessageAsync(
            args.ApplicationMessage.Topic,
            args.ApplicationMessage.ConvertPayloadToString(),
            stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                // Before connecting, so the retained messages that arrive on
                // subscribe are matched against real doors.
                await RefreshKnownDoorsAsync(stoppingToken);

                if (!client.IsConnected)
                {
                    var options = new MqttClientOptionsBuilder()
                        .WithTcpServer(host, port)
                        .WithClientId($"smartdoor-backend-{Environment.MachineName}")
                        .WithCredentials(username, password)
                        .WithCleanSession(true)
                        .Build();
                    await client.ConnectAsync(options, stoppingToken);

                    // Until each door's retained "online" arrives again.
                    doorsOnMqtt.Clear();
                    publishedAccessVersions.Clear();

                    var subscribe = factory.CreateSubscribeOptionsBuilder()
                        .WithTopicFilter(f => f.WithTopic(DoorMqttTopics.StatusWildcard).WithQualityOfServiceLevel(MqttQualityOfServiceLevel.AtLeastOnce))
                        .WithTopicFilter(f => f.WithTopic(DoorMqttTopics.ReportWildcard).WithQualityOfServiceLevel(MqttQualityOfServiceLevel.AtLeastOnce))
                        .WithTopicFilter(f => f.WithTopic(DoorMqttTopics.OnlineWildcard).WithQualityOfServiceLevel(MqttQualityOfServiceLevel.AtLeastOnce))
                        .Build();
                    await client.SubscribeAsync(subscribe, stoppingToken);
                    logger.LogInformation("MQTT door link connected to {Host}:{Port}", host, port);
                }

                foreach (var doorId in knownDoors)
                {
                    await PublishAccessVersionAsync(client, doorId, stoppingToken);
                    await PublishPendingCommandsAsync(client, doorId, stoppingToken);
                }

                // Sleep until a command is queued, or the next round.
                await commandSignal.WaitAsync(RoundInterval, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "MQTT door link failed; retrying in {Delay}", ReconnectDelay);
                await Task.Delay(ReconnectDelay, stoppingToken);
            }
        }

        if (client.IsConnected)
        {
            await client.DisconnectAsync(new MqttClientDisconnectOptions(), CancellationToken.None);
        }
    }

    private async Task RefreshKnownDoorsAsync(CancellationToken cancellationToken)
    {
        using var scope = scopeFactory.CreateScope();
        var doors = await scope.ServiceProvider.GetRequiredService<IDoorService>().ListAsync(cancellationToken);
        knownDoors = doors.Select(d => d.Id).ToHashSet();
    }

    private async Task PublishPendingCommandsAsync(IMqttClient client, Guid doorId, CancellationToken cancellationToken)
    {
        // A door connects with a clean session, so anything published while it
        // isn't listening would be lost — leave commands pending (for its next
        // MQTT connection or its REST heartbeat) until it is.
        if (!doorsOnMqtt.ContainsKey(doorId))
        {
            return;
        }

        using var scope = scopeFactory.CreateScope();
        var commands = await scope.ServiceProvider
            .GetRequiredService<IDeviceCommandService>()
            .TakePendingForDeviceAsync(doorId, cancellationToken);

        foreach (var command in commands)
        {
            var payload = JsonSerializer.Serialize(DeviceCommandDto.From(command), Json);
            await PublishAsync(client, DoorMqttTopics.Command(doorId), payload, retain: false, cancellationToken);
            logger.LogInformation("MQTT pushed {Type} command {Id} to door {DoorId}", command.Type, command.Id, doorId);
        }
    }

    private async Task PublishAccessVersionAsync(IMqttClient client, Guid doorId, CancellationToken cancellationToken)
    {
        using var scope = scopeFactory.CreateScope();
        var accessList = await scope.ServiceProvider
            .GetRequiredService<IAccessListService>()
            .BuildAsync(doorId, cancellationToken);

        if (publishedAccessVersions.TryGetValue(doorId, out var published) && published == accessList.Version)
        {
            return;
        }

        await PublishAsync(client, DoorMqttTopics.Access(doorId), accessList.Version, retain: true, cancellationToken);
        publishedAccessVersions[doorId] = accessList.Version;
    }

    private static Task PublishAsync(IMqttClient client, string topic, string payload, bool retain, CancellationToken cancellationToken) =>
        client.PublishAsync(
            new MqttApplicationMessageBuilder()
                .WithTopic(topic)
                .WithPayload(payload)
                .WithQualityOfServiceLevel(MqttQualityOfServiceLevel.AtLeastOnce)
                .WithRetainFlag(retain)
                .Build(),
            cancellationToken);

    private async Task HandleMessageAsync(string topic, string? payload, CancellationToken cancellationToken)
    {
        if (payload is null || DoorMqttTopics.Parse(topic) is not var (doorId, kind) || !knownDoors.Contains(doorId))
        {
            return;
        }

        try
        {
            switch (kind)
            {
                case "status":
                    await HandleStatusAsync(doorId, payload);
                    break;

                case "report":
                    await HandleReportAsync(doorId, payload, cancellationToken);
                    break;

                case "online" when payload == "1":
                    doorsOnMqtt[doorId] = true;
                    commandSignal.Notify();
                    break;

                case "online" when payload == "0":
                    doorsOnMqtt.TryRemove(doorId, out _);
                    await statusStore.MarkOfflineAsync(doorId);
                    logger.LogInformation("MQTT: door {DoorId} went offline", doorId);
                    break;
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to handle MQTT message on {Topic}", topic);
        }
    }

    private async Task HandleStatusAsync(Guid doorId, string payload)
    {
        var status = JsonSerializer.Deserialize<HeartbeatRequest>(payload, Json);
        if (status is null)
        {
            return;
        }

        await statusStore.SaveAsync(doorId, new DoorStatusSnapshot(
            status.DoorOpen,
            status.Locked,
            status.FingerprintReady,
            status.TemplateCount,
            status.FirmwareVersion,
            status.IpAddress,
            status.Rssi,
            status.UptimeMs,
            DateTimeOffset.UtcNow));

        // The door may have just come back — send anything that waited.
        commandSignal.Notify();
    }

    private async Task HandleReportAsync(Guid doorId, string payload, CancellationToken cancellationToken)
    {
        var report = JsonSerializer.Deserialize<MqttCommandReport>(payload, Json);
        if (report is null)
        {
            return;
        }

        using var scope = scopeFactory.CreateScope();
        await scope.ServiceProvider
            .GetRequiredService<IDeviceCommandService>()
            .ApplyDeviceUpdateAsync(doorId, report.Id, new DeviceCommandUpdate(report.Status, report.Step, report.Message), cancellationToken);
    }
}
