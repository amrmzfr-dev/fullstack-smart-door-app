namespace SmartDoor.Api.Services;

// Must match PIN_MIN_LENGTH / PIN_MAX_LENGTH in the door firmware.
public static class PinRules
{
    public const int MinLength = 4;
    public const int MaxLength = 4;

    public static bool IsValid(string? pin) =>
        pin is not null
        && pin.Length is >= MinLength and <= MaxLength
        && pin.All(char.IsAsciiDigit);

    public static string Describe() => $"PIN must be exactly {MinLength} digits.";
}
