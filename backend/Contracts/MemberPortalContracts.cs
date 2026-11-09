namespace SmartDoor.Api.Contracts;

// ---- A person's own account (the /account page) ----

public sealed record MemberLoginRequest(string Username, string Password);
public sealed record MemberLoginResponse(string Token, string Name, string Username);

// A short-lived admin sign-in for a person who was given admin access.
public sealed record MemberAdminTokenResponse(string Token, string Username);

public sealed record MemberChangePasswordRequest(string CurrentPassword, string NewPassword);

// Latitude / Longitude / AccuracyMeters: where the phone is, needed when the
// door has a geofence.
public sealed record MemberUnlockRequest(
    Guid DoorId,
    string? Pin,
    double? Latitude = null,
    double? Longitude = null,
    double? AccuracyMeters = null);

// A door this person may open, with what the page needs to show it.
public sealed record MemberDoorResponse(
    Guid Id,
    string Name,
    bool Online,
    bool? DoorOpen,
    bool? Locked,
    bool PinRequired,
    bool PinSet,
    DoorSchedule Schedule,
    bool GeofenceEnabled);

public sealed record MemberProfileResponse(
    Guid Id,
    string Name,
    string Username,
    string? PasswordHint,
    DateTimeOffset? LastLoginAt,
    bool IsAdmin,
    int Phones,
    int Fingerprints,
    IReadOnlyList<MemberDoorResponse> Doors);
