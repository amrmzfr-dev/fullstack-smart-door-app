namespace SmartDoor.Api.Contracts;

public sealed record EnrollFingerprintRequest(string Label, Guid DoorId);
