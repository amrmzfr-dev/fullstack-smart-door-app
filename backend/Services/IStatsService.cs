using SmartDoor.Api.Contracts;

namespace SmartDoor.Api.Services;

public interface IStatsService
{
    // utcOffsetMinutes = the viewer's time zone, so "today" is their today.
    Task<StatsResponse> GetAsync(int utcOffsetMinutes, CancellationToken cancellationToken);
}
