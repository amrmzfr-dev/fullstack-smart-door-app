namespace SmartDoor.Api.Contracts;

public sealed record LoginRequest(string Username, string Password);
public sealed record LoginResponse(string Token, string Username);
public sealed record MeResponse(string Username, string? PasswordHint);
public sealed record ChangePasswordRequest(string CurrentPassword, string NewPassword);
