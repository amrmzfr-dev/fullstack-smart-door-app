using SmartDoor.Api.Models;

namespace SmartDoor.Api.Contracts;

// One calendar day (in the viewer's time zone), "2026-11-08".
public sealed record DayStat(string Date, int Granted, int Denied, int Alarms);

public sealed record MethodStat(AccessMethod Method, int Count);

public sealed record DoorStat(Guid? DoorId, string Name, int Granted, int Denied);

public sealed record PersonStat(Guid MemberId, string Name, int Count, DateTimeOffset LastAt);

// Opens per hour of the day (0-23) over the last 30 days.
public sealed record HourStat(int Hour, int Count);

// Everything the admin Overview tab shows, in one request.
public sealed record StatsResponse(
    int Members,
    int MembersEnabled,
    int MembersWithAccount,
    int MembersWithPhone,
    int MembersWithFingerprint,
    int Doors,
    int DoorsOnline,
    int DoorsPinRequired,
    int DoorsWithOpenHours,
    int GrantedToday,
    int DeniedToday,
    int AlarmsToday,
    int SignInsToday,
    int ActivePeopleToday,
    IReadOnlyList<DayStat> Days,
    IReadOnlyList<MethodStat> Methods,
    IReadOnlyList<DoorStat> PerDoor,
    IReadOnlyList<PersonStat> TopPeople,
    IReadOnlyList<HourStat> Hours);
