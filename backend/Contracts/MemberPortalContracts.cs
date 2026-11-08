namespace SmartDoor.Api.Contracts;

// ---- A person's own account (the /account page) ----

public sealed record MemberLoginRequest(string Username, string Password);
public sealed record MemberLoginResponse(string Token, string Name, string Username);

public sealed record MemberChangePasswordRequest(string CurrentPassword, string NewPassword);

public sealed record MemberUnlockRequest(Guid DoorId, string? Pin);

// A door this person may open, with what the page needs to show it.
public sealed record MemberDoorResponse(
    Guid Id,
    string Name,
    bool Online,
    bool? DoorOpen,
    bool? Locked,
    bool PinRequired,
    bool PinSet,
    DoorSchedule Schedule);

public sealed record MemberProfileResponse(
    Guid Id,
    string Name,
    string Username,
    string? PasswordHint,
    DateTimeOffset? LastLoginAt,
    int Phones,
    int Fingerprints,
    IReadOnlyList<MemberDoorResponse> Doors);
