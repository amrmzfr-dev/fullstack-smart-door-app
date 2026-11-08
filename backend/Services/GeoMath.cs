namespace SmartDoor.Api.Services;

// Where a phone says it is. Accuracy is the phone's own error radius in metres.
public sealed record GeoPoint(double Latitude, double Longitude, double? AccuracyMeters);

public static class GeoMath
{
    private const double EarthRadiusMeters = 6_371_000;

    // A phone's position is only roughly right. Give it the benefit of its own
    // reported error, but never more than this, so a useless reading
    // (accuracy 5 km) can't open the door from anywhere.
    public const double MaxAccuracyBenefitMeters = 100;

    public static bool IsValid(double latitude, double longitude) =>
        latitude is >= -90 and <= 90 && longitude is >= -180 and <= 180
        && !double.IsNaN(latitude) && !double.IsNaN(longitude);

    // Straight-line distance over the ground, in metres (haversine).
    public static double DistanceMeters(double lat1, double lon1, double lat2, double lon2)
    {
        var dLat = ToRadians(lat2 - lat1);
        var dLon = ToRadians(lon2 - lon1);
        var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2)
            + Math.Cos(ToRadians(lat1)) * Math.Cos(ToRadians(lat2)) * Math.Sin(dLon / 2) * Math.Sin(dLon / 2);
        return 2 * EarthRadiusMeters * Math.Asin(Math.Min(1, Math.Sqrt(a)));
    }

    private static double ToRadians(double degrees) => degrees * Math.PI / 180;
}
