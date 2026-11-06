import { CoordinatesSchema, type Coordinates } from '@fieldwork/contracts';
import type { Locale } from '@fieldwork/strings';
import { managerSitesCopy } from './manager-sites-copy';

export function parseCoordinateInputs(
  latitude: string,
  longitude: string,
  locale: Locale = 'en',
): Coordinates | undefined {
  const copy = managerSitesCopy[locale].coordinates;
  if (!latitude.trim() && !longitude.trim()) return undefined;
  if (!latitude.trim() || !longitude.trim()) throw new Error(copy.required);
  const result = CoordinatesSchema.safeParse({
    latitude: Number(latitude),
    longitude: Number(longitude),
  });
  if (!result.success) throw new Error(copy.range);
  return result.data;
}
