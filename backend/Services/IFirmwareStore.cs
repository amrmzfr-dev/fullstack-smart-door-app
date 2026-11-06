namespace SmartDoor.Api.Services;

public sealed record FirmwareFile(string Version, string Path, long Length, string Sha256);

// The door firmware files (<version>.bin) the backend hands out for OTA
// updates. Kept in a folder on disk (Firmware:Directory) — mount it as a
// volume in Docker, or uploads vanish on the next deploy.
public interface IFirmwareStore
{
    // Versions end up in a file name and in the door's 16-char buffer, so only
    // letters, digits, dot, dash and underscore are allowed.
    bool IsValidVersion(string version);

    // Null when that version isn't uploaded.
    FirmwareFile? Find(string version);

    IReadOnlyList<FirmwareFile> List();

    // Writes the file only when the whole body arrived (temp file, then rename).
    Task<FirmwareFile> SaveAsync(string version, Stream body, CancellationToken cancellationToken);
}
