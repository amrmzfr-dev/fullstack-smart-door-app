using Microsoft.EntityFrameworkCore;
using SmartDoor.Api.Contracts;
using SmartDoor.Api.Data;
using SmartDoor.Api.Models;

namespace SmartDoor.Api.Services;

public class StatsService(AppDbContext dbContext, IDoorStatusStore doorStatusStore) : IStatsService
{
    private const int ChartDays = 14;
    private const int WindowDays = 30;
    private const int TopPeopleCount = 8;
    private const int MaxEvents = 50000;

    public async Task<StatsResponse> GetAsync(int utcOffsetMinutes, CancellationToken cancellationToken)
    {
        var offset = TimeSpan.FromMinutes(Math.Clamp(utcOffsetMinutes, -14 * 60, 14 * 60));
        var localToday = (DateTimeOffset.UtcNow + offset).Date;
        // The database only takes UTC times, so convert the local start of the window.
        var windowStart = new DateTimeOffset(localToday.AddDays(-(WindowDays - 1)), offset).ToUniversalTime();

        var events = await dbContext.AccessEvents
            .AsNoTracking()
            .Where(e => e.OccurredAt >= windowStart)
            .OrderByDescending(e => e.OccurredAt)
            .Take(MaxEvents)
            .Select(e => new { e.Type, e.Method, e.MemberId, e.MemberName, e.DoorId, e.DoorName, e.OccurredAt })
            .ToListAsync(cancellationToken);

        DateTime LocalDay(DateTimeOffset when) => (when + offset).Date;
        var today = events.Where(e => LocalDay(e.OccurredAt) == localToday).ToList();

        var days = Enumerable.Range(0, ChartDays)
            .Select(i => localToday.AddDays(i - (ChartDays - 1)))
            .Select(day =>
            {
                var ofDay = events.Where(e => LocalDay(e.OccurredAt) == day).ToList();
                return new DayStat(
                    day.ToString("yyyy-MM-dd"),
                    ofDay.Count(e => e.Type == AccessEventType.Granted),
                    ofDay.Count(e => e.Type == AccessEventType.Denied),
                    ofDay.Count(e => e.Type is AccessEventType.ForcedOpen or AccessEventType.LeftOpen));
            })
            .ToList();

        var granted = events.Where(e => e.Type == AccessEventType.Granted).ToList();

        var methods = granted
            .GroupBy(e => e.Method)
            .Select(g => new MethodStat(g.Key, g.Count()))
            .OrderByDescending(m => m.Count)
            .ToList();

        var perDoor = events
            .Where(e => e.Type is AccessEventType.Granted or AccessEventType.Denied)
            .GroupBy(e => e.DoorId)
            .Select(g => new DoorStat(
                g.Key,
                g.Select(e => e.DoorName).FirstOrDefault(n => n is not null) ?? "Unknown door",
                g.Count(e => e.Type == AccessEventType.Granted),
                g.Count(e => e.Type == AccessEventType.Denied)))
            .OrderByDescending(d => d.Granted + d.Denied)
            .ToList();

        var topPeople = granted
            .Where(e => e.MemberId is not null)
            .GroupBy(e => e.MemberId!.Value)
            .Select(g => new PersonStat(
                g.Key,
                g.OrderByDescending(e => e.OccurredAt).First().MemberName ?? "Unknown",
                g.Count(),
                g.Max(e => e.OccurredAt)))
            .OrderByDescending(p => p.Count)
            .ThenByDescending(p => p.LastAt)
            .Take(TopPeopleCount)
            .ToList();

        var byHour = granted.GroupBy(e => (e.OccurredAt + offset).Hour).ToDictionary(g => g.Key, g => g.Count());
        var hours = Enumerable.Range(0, 24).Select(h => new HourStat(h, byHour.GetValueOrDefault(h))).ToList();

        var doors = await dbContext.Doors.AsNoTracking().ToListAsync(cancellationToken);
        var doorsOnline = 0;
        foreach (var door in doors)
        {
            if (await doorStatusStore.IsOnlineAsync(door.Id))
            {
                doorsOnline++;
            }
        }

        var members = await dbContext.Members
            .AsNoTracking()
            .Select(m => new
            {
                m.Enabled,
                HasAccount = m.Username != null,
                HasPhone = m.PhoneKeys.Any(),
                HasFingerprint = m.Fingerprints.Any(),
            })
            .ToListAsync(cancellationToken);

        return new StatsResponse(
            members.Count,
            members.Count(m => m.Enabled),
            members.Count(m => m.HasAccount),
            members.Count(m => m.HasPhone),
            members.Count(m => m.HasFingerprint),
            doors.Count,
            doorsOnline,
            doors.Count(d => d.PinRequired),
            doors.Count(d => d.ScheduleEnabled),
            today.Count(e => e.Type == AccessEventType.Granted),
            today.Count(e => e.Type == AccessEventType.Denied),
            today.Count(e => e.Type is AccessEventType.ForcedOpen or AccessEventType.LeftOpen),
            today.Count(e => e.Type == AccessEventType.SignIn),
            today.Where(e => e.Type == AccessEventType.Granted && e.MemberId is not null).Select(e => e.MemberId).Distinct().Count(),
            days,
            methods,
            perDoor,
            topPeople,
            hours);
    }
}
