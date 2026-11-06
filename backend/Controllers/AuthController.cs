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

        // Accounts made before password hints existed get theirs now, while
        // the real password is at hand.
        if (user.PasswordHint is null)
        {
            user.PasswordHint = PasswordHintBuilder.Build(request.Password);
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        var token = jwtTokenService.GenerateToken(user.Id, user.Username);
        return Ok(new LoginResponse(token, user.Username));
    }

    [HttpGet("me")]
    public async Task<ActionResult<MeResponse>> MeAsync(CancellationToken cancellationToken)
    {
        var username = this.CurrentUsername();
        var user = await dbContext.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Username == username, cancellationToken);
        return user is null ? Unauthorized() : Ok(new MeResponse(user.Username, user.PasswordHint));
    }

    // The signed-in user changes their own password.
    [HttpPut("password")]
    public async Task<ActionResult<MeResponse>> ChangePasswordAsync(
        [FromBody] ChangePasswordRequest request,
        CancellationToken cancellationToken)
    {
        var username = this.CurrentUsername();
        var user = await dbContext.Users.FirstOrDefaultAsync(u => u.Username == username, cancellationToken);
        if (user is null)
        {
            return Unauthorized();
        }

        if (string.IsNullOrEmpty(request.CurrentPassword)
            || PasswordHasher.VerifyHashedPassword(user, user.PasswordHash, request.CurrentPassword) == PasswordVerificationResult.Failed)
        {
            return BadRequest("Your current password is not right.");
        }

        var problem = PasswordHintBuilder.Check(request.NewPassword);
        if (problem is not null)
        {
            return BadRequest(problem);
        }

        if (request.NewPassword == request.CurrentPassword)
        {
            return BadRequest("The new password must be different from the current one.");
        }

        user.PasswordHash = PasswordHasher.HashPassword(user, request.NewPassword);
        user.PasswordHint = PasswordHintBuilder.Build(request.NewPassword);
        await dbContext.SaveChangesAsync(cancellationToken);
        return Ok(new MeResponse(user.Username, user.PasswordHint));
    }
}
