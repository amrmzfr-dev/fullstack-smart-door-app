using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using SmartDoor.Api.Models;
using SmartDoor.Api.Services;

namespace SmartDoor.Api.Filters;

// Guards the door-controller endpoints with the door's own key (the firmware
// sends its DEVICE_API_KEY as the X-Device-Key header) instead of a user
// login. The key also says WHICH door is calling — read it with
// HttpContext.GetDoor(). Pair with [AllowAnonymous] so the JWT fallback
// policy doesn't reject the request first.
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class DeviceKeyAttribute : Attribute, IAsyncAuthorizationFilter
{
    public const string HeaderName = "X-Device-Key";
    private const string DoorItemKey = "SmartDoor.Door";

    public async Task OnAuthorizationAsync(AuthorizationFilterContext context)
    {
        var doors = context.HttpContext.RequestServices.GetRequiredService<IDoorService>();
        var provided = context.HttpContext.Request.Headers[HeaderName].ToString();
        var door = await doors.FindByKeyAsync(provided, context.HttpContext.RequestAborted);
        if (door is null)
        {
            context.Result = new UnauthorizedResult();
            return;
        }

        context.HttpContext.Items[DoorItemKey] = door;
    }

    public static Door GetDoor(HttpContext httpContext) =>
        httpContext.Items[DoorItemKey] as Door
        ?? throw new InvalidOperationException("No door on this request — is [DeviceKey] missing?");
}
