using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Fido2NetLib;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using SmartDoor.Api.Controllers;
using SmartDoor.Api.Data;
using SmartDoor.Api.Services;
using StackExchange.Redis;

var builder = WebApplication.CreateBuilder(args);

var connectionString = builder.Configuration.GetConnectionString("DefaultConnection");
if (string.IsNullOrWhiteSpace(connectionString))
{
    throw new InvalidOperationException(
        "Connection string 'DefaultConnection' is not configured. Set it via environment variable or user secrets.");
}

builder.Services.AddDbContext<AppDbContext>(options => options.UseNpgsql(connectionString));

var jwtKey = builder.Configuration["Jwt:Key"];
if (string.IsNullOrWhiteSpace(jwtKey))
{
    throw new InvalidOperationException("Jwt:Key is not configured. Set it via environment variable or user secrets.");
}
var jwtIssuer = builder.Configuration["Jwt:Issuer"] ?? "smart-door";
var jwtAudience = builder.Configuration["Jwt:Audience"] ?? "smart-door";

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        // Without this, the handler remaps short claim types (e.g. "unique_name")
        // to legacy long-form URIs, so FindFirst(UniqueName) silently returns null.
        options.MapInboundClaims = false;
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidIssuer = jwtIssuer,
            ValidateAudience = true,
            ValidAudience = jwtAudience,
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey)),
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromMinutes(1),
        };
    });

// Everything needs a login unless marked [AllowAnonymous] (login itself, the
// public keypad app, and the door-controller endpoints, which use DeviceKey).
builder.Services.AddAuthorization(options =>
{
    options.FallbackPolicy = new AuthorizationPolicyBuilder()
        .RequireAuthenticatedUser()
        .Build();
});

var redisConnectionString = builder.Configuration["Redis:ConnectionString"] ?? "localhost:6379";
builder.Services.AddSingleton<IConnectionMultiplexer>(_ =>
    ConnectionMultiplexer.Connect(redisConnectionString));

builder.Services.AddSingleton<IJwtTokenService, JwtTokenService>();
builder.Services.AddSingleton<IPinHasher, PinHasher>();
builder.Services.AddSingleton<IDoorStatusStore, RedisDoorStatusStore>();
builder.Services.AddScoped<IAccessListService, AccessListService>();
builder.Services.AddScoped<IDeviceCommandService, DeviceCommandService>();
builder.Services.AddScoped<IMemberService, MemberService>();
builder.Services.AddScoped<IFingerprintService, FingerprintService>();
builder.Services.AddScoped<IAccessEventService, AccessEventService>();
builder.Services.AddScoped<IDoorAccessService, DoorAccessService>();
builder.Services.AddScoped<IPhoneKeyService, PhoneKeyService>();

var allowedOrigins = builder.Configuration
    .GetSection("Cors:AllowedOrigins")
    .Get<string[]>() ?? ["http://localhost:5173"];

// Phone fingerprint unlock (WebAuthn). RpId must be the web app's host name
// (no port), and every address the app is opened from must be an origin.
var webAuthnOrigins = builder.Configuration
    .GetSection("WebAuthn:Origins")
    .Get<string[]>() ?? allowedOrigins;
builder.Services.AddSingleton(new Fido2Configuration
{
    ServerDomain = builder.Configuration["WebAuthn:RpId"] ?? "localhost",
    ServerName = "Smart Door",
    Origins = new HashSet<string>(webAuthnOrigins),
});
builder.Services.AddSingleton<IFido2>(sp => new Fido2(sp.GetRequiredService<Fido2Configuration>()));

// The keypad app has no login, so PIN guesses are limited per address.
// Deployed behind Cloudflare + a reverse proxy, every request arrives from a
// proxy address, so the visitor's own address comes from CF-Connecting-IP.
// That header can be faked by someone hitting the server directly, so an
// overall cap across everyone backs up the per-visitor one.
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy(RateLimits.PinAttempts, context =>
    {
        var visitor = context.Request.Headers["CF-Connecting-IP"].FirstOrDefault()
            ?? context.Connection.RemoteIpAddress?.ToString()
            ?? "unknown";
        return RateLimitPartition.GetFixedWindowLimiter(
            visitor,
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = RateLimits.PinAttemptsPerWindow,
                Window = RateLimits.PinAttemptsWindow,
                QueueLimit = 0,
            });
    });
    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
        context.GetEndpoint()?.Metadata.GetMetadata<EnableRateLimitingAttribute>()?.PolicyName
            == RateLimits.PinAttempts
            ? RateLimitPartition.GetFixedWindowLimiter(
                "all-visitors",
                _ => new FixedWindowRateLimiterOptions
                {
                    PermitLimit = RateLimits.PinAttemptsAllVisitorsPerWindow,
                    Window = RateLimits.PinAttemptsWindow,
                    QueueLimit = 0,
                })
            : RateLimitPartition.GetNoLimiter("unlimited"));
});

builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
    {
        policy.WithOrigins(allowedOrigins)
            .WithMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
            .WithHeaders("Content-Type", "Authorization", "Accept");
    });
});

// Enums go over the wire as snake_case strings ("exit_button",
// "enroll_fingerprint") — the firmware and frontend both use these names.
builder.Services
    .AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(
            new JsonStringEnumConverter(JsonNamingPolicy.SnakeCaseLower, allowIntegerValues: false));
    });

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var dbContext = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await dbContext.Database.MigrateAsync();
    await UserSeeder.SeedAsync(dbContext, app.Configuration);
}

app.UseCors("Frontend");
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();
app.MapControllers();

app.Run();
