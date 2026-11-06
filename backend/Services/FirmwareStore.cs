using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text.RegularExpressions;

namespace SmartDoor.Api.Services;

public sealed partial class FirmwareStore : IFirmwareStore
{
    private const string Extension = ".bin";

    // The ESP32 app slot is 1.25MB — anything bigger can never be installed.
    public const long MaxBytes = 1_310_720;

    private readonly string directory;

    // SHA-256 per file, recomputed only when the file changes.
    private readonly ConcurrentDictionary<string, (DateTime ModifiedUtc, long Length, string Sha256)> hashes = new();

    public FirmwareStore(IConfiguration configuration, IHostEnvironment environment)
    {
        var configured = configuration["Firmware:Directory"];
        directory = Path.GetFullPath(
            string.IsNullOrWhiteSpace(configured) ? "firmware" : configured,
            environment.ContentRootPath);
        Directory.CreateDirectory(directory);
    }

    public bool IsValidVersion(string version) => VersionPattern().IsMatch(version);

    public FirmwareFile? Find(string version)
    {
        if (!IsValidVersion(version))
        {
            return null;
        }

        var path = PathFor(version);
        return File.Exists(path) ? Describe(version, path) : null;
    }

    public IReadOnlyList<FirmwareFile> List() =>
        Directory.EnumerateFiles(directory, "*" + Extension)
            .Select(path => (Version: Path.GetFileNameWithoutExtension(path), Path: path))
            .Where(file => IsValidVersion(file.Version))
            .Select(file => Describe(file.Version, file.Path))
            .OrderBy(file => file.Version, StringComparer.Ordinal)
            .ToList();

    public async Task<FirmwareFile> SaveAsync(string version, Stream body, CancellationToken cancellationToken)
    {
        var temp = Path.Combine(directory, $"{Guid.NewGuid():N}.tmp");
        try
        {
            await using (var output = File.Create(temp))
            {
                var buffer = new byte[16 * 1024];
                long total = 0;
                int read;
                while ((read = await body.ReadAsync(buffer, cancellationToken)) > 0)
                {
                    total += read;
                    if (total > MaxBytes)
                    {
                        throw new InvalidDataException("Firmware file is too big for the door's update slot.");
                    }

                    await output.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
                }
            }

            File.Move(temp, PathFor(version), overwrite: true);
        }
        finally
        {
            File.Delete(temp);
        }

        return Describe(version, PathFor(version));
    }

    private string PathFor(string version) => Path.Combine(directory, version + Extension);

    private FirmwareFile Describe(string version, string path)
    {
        var info = new FileInfo(path);
        var cached = hashes.TryGetValue(path, out var known)
                     && known.ModifiedUtc == info.LastWriteTimeUtc
                     && known.Length == info.Length;
        if (!cached)
        {
            using var stream = File.OpenRead(path);
            known = (info.LastWriteTimeUtc, info.Length, Convert.ToHexStringLower(SHA256.HashData(stream)));
            hashes[path] = known;
        }

        return new FirmwareFile(version, path, info.Length, known.Sha256);
    }

    [GeneratedRegex("^[0-9A-Za-z._-]{1,15}$")]
    private static partial Regex VersionPattern();
}
