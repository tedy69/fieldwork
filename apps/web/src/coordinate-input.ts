import { CoordinatesSchema, type Coordinates } from '@fieldwork/contracts';

export function parseCoordinateInputs(
  latitude: string,
  longitude: string,
): Coordinates | undefined {
  if (!latitude.trim() && !longitude.trim()) return undefined;
  if (!latitude.trim() || !longitude.trim())
    throw new Error('Enter both latitude and longitude, or leave both empty.');
  const result = CoordinatesSchema.safeParse({
    latitude: Number(latitude),
    longitude: Number(longitude),
  });
  if (!result.success)
    throw new Error('Latitude must be between −90 and 90, and longitude between −180 and 180.');
  return result.data;
}
