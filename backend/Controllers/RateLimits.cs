namespace SmartDoor.Api.Controllers;

public static class RateLimits
{
    // Anything that checks a PIN without a login. A 4-digit PIN has 10,000
    // values, so guesses per device have to be slow.
    public const string PinAttempts = "pin-attempts";
    public const int PinAttemptsPerWindow = 8;

    // Backstop across all visitors together, in case the per-visitor address
    // is faked to dodge the limit above.
    public const int PinAttemptsAllVisitorsPerWindow = 60;
    public static readonly TimeSpan PinAttemptsWindow = TimeSpan.FromMinutes(1);
}
