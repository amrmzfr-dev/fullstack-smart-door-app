using System.Text.Json;
using SmartDoor.Api.Models;

namespace SmartDoor.Api.Contracts;

// ---- Public keypad app (no login) ----

public sealed record PinUnlockRequest(Guid DoorId, string Pin);

// Only what the keypad needs to show "opening… / door open / didn't respond".
// Deliberately no member name — the app never says who someone is.
public sealed record UnlockProgressResponse(Guid Id, CommandStatus Status, string? Message)
{
    public static UnlockProgressResponse From(DeviceCommand command) =>
        new(command.Id, command.Status, command.Message);
}

// Options are the WebAuthn JSON the browser passes to navigator.credentials.
public sealed record WebAuthnChallengeResponse(Guid FlowId, JsonElement Options);

public sealed record StartPhoneUnlockRequest(Guid DoorId);

public sealed record FinishPhoneUnlockRequest(Guid FlowId, Guid DoorId, JsonElement Credential);
