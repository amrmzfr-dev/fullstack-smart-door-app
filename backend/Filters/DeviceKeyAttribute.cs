using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace SmartDoor.Api.Filters;

// Guards the door-controller endpoints with a shared key (config
// "Device:ApiKey", sent by the firmware as the X-Device-Key header) instead of
// a user login. Pair with [AllowAnonymous] so the JWT fallback policy doesn't
// reject the request first.
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class DeviceKeyAttribute : Attribute, IAuthorizationFilter
{
    public const string HeaderName = "X-Device-Key";

    public void OnAuthorization(AuthorizationFilterContext context)
    {
        var configuration = context.HttpContext.RequestServices.GetRequiredService<IConfiguration>();
        var expected = configuration["Device:ApiKey"];
        if (string.IsNullOrEmpty(expected))
        {
            context.Result = new ObjectResult("Device:ApiKey is not configured.")
            {
                StatusCode = StatusCodes.Status503ServiceUnavailable,
            };
            return;
        }

        var provided = context.HttpContext.Request.Headers[HeaderName].ToString();
        var matches = CryptographicOperations.FixedTimeEquals(
            Encoding.UTF8.GetBytes(expected),
            Encoding.UTF8.GetBytes(provided));

        if (!matches)
        {
            context.Result = new UnauthorizedResult();
        }
    }
}
