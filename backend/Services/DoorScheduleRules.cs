using System.Globalization;
using SmartDoor.Api.Contracts;
using SmartDoor.Api.Models;

namespace SmartDoor.Api.Services;

// Turns the admin's "07:00" / [0..4] into what is stored (minutes / bit mask)
// and back. Monday = day 0 ... Sunday = day 6.
public static class DoorScheduleRules
{
    private const int AllDays = 0b1111111;

    public static DoorSchedule ToDto(Door door) =>
        new(
            door.ScheduleEnabled,
            FormatTime(door.ScheduleFromMinutes),
            FormatTime(door.ScheduleUntilMinutes),
            Enumerable.Range(0, 7).Where(day => (door.ScheduleDays & (1 << day)) != 0).ToList(),
            door.ScheduleUtcOffsetMinutes);

    // Returns an error message, or null when the schedule was applied.
    public static string? Apply(Door door, UpdateDoorScheduleRequest request)
    {
        if (!TryParseTime(request.From, out var from) || !TryParseTime(request.Until, out var until))
        {
            return "Times must look like 07:00.";
        }

        if (from >= until)
        {
            return "The door must lock after it unlocks (Until is later than From, same day).";
        }

        var days = 0;
        foreach (var day in request.Days ?? [])
        {
            if (day is < 0 or > 6)
            {
                return "Days must be 0 (Monday) to 6 (Sunday).";
            }

            days |= 1 << day;
        }

        if (request.Enabled && days == 0)
        {
            return "Pick at least one day.";
        }

        door.ScheduleEnabled = request.Enabled;
        door.ScheduleFromMinutes = from;
        door.ScheduleUntilMinutes = until;
        door.ScheduleDays = days & AllDays;
        return null;
    }

    private static string FormatTime(int minutes) => $"{minutes / 60:00}:{minutes % 60:00}";

    private static bool TryParseTime(string? text, out int minutes)
    {
        minutes = 0;
        if (!TimeOnly.TryParseExact(text, "HH:mm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var time))
        {
            return false;
        }

        minutes = time.Hour * 60 + time.Minute;
        return true;
    }
}
