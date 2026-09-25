using System.IdentityModel.Tokens.Jwt;
using Microsoft.AspNetCore.Mvc;
using SmartDoor.Api.Services;

namespace SmartDoor.Api.Controllers;

public static class ControllerExtensions
{
    public static ActionResult ToActionResult<T>(
        this ControllerBase controller,
        ServiceResult<T> result,
        Func<T, ActionResult> onOk) =>
        result.Status switch
        {
            ServiceStatus.Ok => onOk(result.Value!),
            ServiceStatus.NotFound => controller.NotFound(result.Error),
            ServiceStatus.Invalid => controller.BadRequest(result.Error),
            ServiceStatus.Conflict => controller.Conflict(result.Error),
            _ => controller.StatusCode(StatusCodes.Status500InternalServerError),
        };

    public static string CurrentUsername(this ControllerBase controller) =>
        controller.User.FindFirst(JwtRegisteredClaimNames.UniqueName)?.Value ?? "unknown";
}
