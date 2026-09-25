namespace SmartDoor.Api.Services;

public enum ServiceStatus
{
    Ok,
    NotFound,
    Invalid,
    Conflict,
}

// Lets services report "not found / bad input / clash" without throwing, and
// lets controllers map that to an HTTP status in one place (see
// ControllerResultExtensions).
public sealed record ServiceResult<T>(ServiceStatus Status, T? Value, string? Error)
{
    public static ServiceResult<T> Ok(T value) => new(ServiceStatus.Ok, value, null);
    public static ServiceResult<T> NotFound(string error) => new(ServiceStatus.NotFound, default, error);
    public static ServiceResult<T> Invalid(string error) => new(ServiceStatus.Invalid, default, error);
    public static ServiceResult<T> Conflict(string error) => new(ServiceStatus.Conflict, default, error);
}
