using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using SmartDoor.Api.Contracts;
using SmartDoor.Api.Data;
using SmartDoor.Api.Models;
using SmartDoor.Api.Services;

namespace SmartDoor.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController(
    AppDbContext dbContext,
    IJwtTokenService jwtTokenService) : ControllerBase
{
    private static readonly PasswordHasher<User> PasswordHasher = new();

    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<ActionResult<LoginResponse>> LoginAsync(
        [FromBody] LoginRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Username) || string.IsNullOrWhiteSpace(request.Password))
        {
            return BadRequest("Username and password are required.");
        }

        var username = request.Username.Trim().ToLowerInvariant();
        var user = await dbContext.Users.FirstOrDefaultAsync(u => u.Username == username, cancellationToken);
        if (user is null)
        {
            return Unauthorized("Invalid username or password.");
        }

        var result = PasswordHasher.VerifyHashedPassword(user, user.PasswordHash, request.Password);
        if (result == PasswordVerificationResult.Failed)
        {
            return Unauthorized("Invalid username or password.");
        }

        var token = jwtTokenService.GenerateToken(user.Id, user.Username);
        return Ok(new LoginResponse(token, user.Username));
    }

    [HttpGet("me")]
    public ActionResult<MeResponse> Me() => Ok(new MeResponse(this.CurrentUsername()));
}
