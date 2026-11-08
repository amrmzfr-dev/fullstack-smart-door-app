// Where this phone is right now (used for the door's geofence).

export interface PhoneLocation {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
}

// An error whose message is safe to show to the person as-is.
export class LocationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocationError";
  }
}

const LOCATION_TIMEOUT_MS = 15_000;

export function getPhoneLocation(): Promise<PhoneLocation> {
  return new Promise((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new LocationError("This phone can't share its location."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
        }),
      (error) => {
        reject(
          new LocationError(
            error.code === error.PERMISSION_DENIED
              ? "Allow location for this site to unlock the door."
              : error.code === error.TIMEOUT
                ? "Couldn't find your location in time. Try again."
                : "Couldn't find your location. Turn on location and try again.",
          ),
        );
      },
      // Fresh reading, never an old cached one — the whole point is "right now".
      { enableHighAccuracy: true, timeout: LOCATION_TIMEOUT_MS, maximumAge: 0 },
    );
  });
}
