export interface CapturedCoordinates {
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

export function validateCoordinates(latitude: number | null, longitude: number | null) {
  if (latitude == null && longitude == null) return null;
  if (latitude == null || longitude == null) return 'Latitude এবং Longitude দুটোই দিতে হবে।';
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    return 'Latitude -90 থেকে 90-এর মধ্যে হতে হবে।';
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    return 'Longitude -180 থেকে 180-এর মধ্যে হতে হবে।';
  }
  return null;
}

function geolocationErrorMessage(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) return 'Location permission দেওয়া হয়নি। Browser settings থেকে permission enable করে আবার চেষ্টা করুন।';
  if (error.code === error.POSITION_UNAVAILABLE) return 'Device এখন location নির্ধারণ করতে পারছে না। কিছুক্ষণ পরে আবার চেষ্টা করুন অথবা coordinate manually দিন।';
  if (error.code === error.TIMEOUT) return 'Location নিতে বেশি সময় লেগেছে। আবার চেষ্টা করুন অথবা coordinate manually দিন।';
  return 'Current location নেওয়া যায়নি। Coordinate manually দিতে পারেন।';
}

export async function captureCurrentCoordinates(): Promise<CapturedCoordinates> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new Error('এই device/browser-এ GPS/Geolocation পাওয়া যাচ্ছে না। Coordinate manually দিন।');
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        const validationError = validateCoordinates(latitude, longitude);
        if (validationError) {
          reject(new Error(validationError));
          return;
        }
        resolve({
          latitude,
          longitude,
          accuracy: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
        });
      },
      (error) => reject(new Error(geolocationErrorMessage(error))),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}
