using System.Text.Json;
using System.Text.Json.Serialization;
using MQTTnet;
using MQTTnet.Protocol;
using SmartDoor.Api.Contracts;
using SmartDoor.Api.Models;
using SmartDoor.Api.Services;

namespace SmartDoor.Api.Mqtt;

// Always-on link to the door through the MQTT broker:
//   - pushes queued commands to the door the moment they're created
//   - takes the door's status / command reports / online state as they happen
//   - publishes the access-list version (retained) so the door re-syncs
// The REST device endpoints stay as the door's fallback when MQTT is down.
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

    private string? publishedAccessVersion;

    // True while the door itself is connected to the broker (its retained
    // "online" = "1"). Door firmware without MQTT never sets it, so its
    // commands keep going out through the REST heartbeat instead.
    private volatile bool doorOnMqtt;

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
                if (!client.IsConnected)
                {
                    var options = new MqttClientOptionsBuilder()
                        .WithTcpServer(host, port)
                        .WithClientId($"smartdoor-backend-{Environment.MachineName}")
                        .WithCredentials(username, password)
                        .WithCleanSession(true)
                        .Build();
                    await client.ConnectAsync(options, stoppingToken);

                    var subscribe = factory.CreateSubscribeOptionsBuilder()
                        .WithTopicFilter(f => f.WithTopic(DoorMqttTopics.Status).WithQualityOfServiceLevel(MqttQualityOfServiceLevel.AtLeastOnce))
                        .WithTopicFilter(f => f.WithTopic(DoorMqttTopics.Report).WithQualityOfServiceLevel(MqttQualityOfServiceLevel.AtLeastOnce))
                        .WithTopicFilter(f => f.WithTopic(DoorMqttTopics.Online).WithQualityOfServiceLevel(MqttQualityOfServiceLevel.AtLeastOnce))
                        .Build();
                    await client.SubscribeAsync(subscribe, stoppingToken);

                    doorOnMqtt = false; // until the door's retained "online" arrives again
                    publishedAccessVersion = null; // re-publish after every (re)connect
                    logger.LogInformation("MQTT door link connected to {Host}:{Port}", host, port);
                }

                await PublishAccessVersionAsync(client, stoppingToken);
                await PublishPendingCommandsAsync(client, stoppingToken);

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

    private async Task PublishPendingCommandsAsync(IMqttClient client, CancellationToken cancellationToken)
    {
        // The door connects with a clean session, so anything published while
        // it isn't listening would be lost — leave commands pending (for its
        // next MQTT connection or its REST heartbeat) until it is.
        if (!doorOnMqtt)
        {
            return;
        }

        using var scope = scopeFactory.CreateScope();
        var commands = await scope.ServiceProvider
            .GetRequiredService<IDeviceCommandService>()
            .TakePendingForDeviceAsync(cancellationToken);

        foreach (var command in commands)
        {
            await PublishAsync(client, DoorMqttTopics.Command, JsonSerializer.Serialize(DeviceCommandDto.From(command), Json), retain: false, cancellationToken);
            logger.LogInformation("MQTT pushed {Type} command {Id} to the door", command.Type, command.Id);
        }
    }

    private async Task PublishAccessVersionAsync(IMqttClient client, CancellationToken cancellationToken)
    {
        using var scope = scopeFactory.CreateScope();
        var accessList = await scope.ServiceProvider
            .GetRequiredService<IAccessListService>()
            .BuildAsync(cancellationToken);

        if (accessList.Version == publishedAccessVersion)
        {
            return;
        }

        await PublishAsync(client, DoorMqttTopics.Access, accessList.Version, retain: true, cancellationToken);
        publishedAccessVersion = accessList.Version;
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
        if (payload is null)
        {
            return;
        }

        try
        {
            switch (topic)
            {
                case DoorMqttTopics.Status:
                    await HandleStatusAsync(payload);
                    break;

                case DoorMqttTopics.Report:
                    await HandleReportAsync(payload, cancellationToken);
                    break;

                case DoorMqttTopics.Online when payload == "1":
                    doorOnMqtt = true;
                    commandSignal.Notify();
                    break;

                case DoorMqttTopics.Online when payload == "0":
                    doorOnMqtt = false;
                    await statusStore.MarkOfflineAsync();
                    logger.LogInformation("MQTT: door went offline");
                    break;
            }
        }
        catch (Exception ex)
        {
            logger.LogError(ex, "Failed to handle MQTT message on {Topic}", topic);
        }
    }

    private async Task HandleStatusAsync(string payload)
    {
        var status = JsonSerializer.Deserialize<HeartbeatRequest>(payload, Json);
        if (status is null)
        {
            return;
        }

        await statusStore.SaveAsync(new DoorStatusSnapshot(
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

    private async Task HandleReportAsync(string payload, CancellationToken cancellationToken)
    {
        var report = JsonSerializer.Deserialize<MqttCommandReport>(payload, Json);
        if (report is null)
        {
            return;
        }

        using var scope = scopeFactory.CreateScope();
        await scope.ServiceProvider
            .GetRequiredService<IDeviceCommandService>()
            .ApplyDeviceUpdateAsync(report.Id, new DeviceCommandUpdate(report.Status, report.Step, report.Message), cancellationToken);
    }
}
