using SmartDoor.Api.Services;

namespace SmartDoor.Api.Contracts;

public sealed record InstallFirmwareRequest(Guid DoorId);

public sealed record FirmwareResponse(string Version, long Length, string Sha256)
{
    public static FirmwareResponse From(FirmwareFile file) => new(file.Version, file.Length, file.Sha256);
}
