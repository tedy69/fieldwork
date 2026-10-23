import { MapProviderSchema, type MapProvider } from '@fieldwork/contracts';

export const defaultMapProvider: MapProvider = {
  name: 'OpenStreetMap',
  tileUrlTemplate: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attributionText: '© OpenStreetMap contributors',
  attributionUrl: 'https://www.openstreetmap.org/copyright',
  maxZoom: 19,
};
export function mapProviderFromEnv(
  env: Record<string, string | undefined> = process.env,
): MapProvider | null {
  if (env.MAPS_ENABLED !== undefined && !['true', 'false'].includes(env.MAPS_ENABLED))
    throw new Error('MAPS_ENABLED must be true or false.');
  if (env.MAPS_ENABLED === 'false') return null;
  const custom = [
    env.MAP_PROVIDER_NAME,
    env.MAP_TILE_URL,
    env.MAP_ATTRIBUTION_TEXT,
    env.MAP_ATTRIBUTION_URL,
  ];
  if (custom.some((value) => value !== undefined) && custom.some((value) => !value?.trim()))
    throw new Error(
      'A custom map provider needs its name, tile URL, attribution text, and attribution URL.',
    );
  return MapProviderSchema.parse({
    ...(custom.some((value) => value !== undefined)
      ? {
          name: env.MAP_PROVIDER_NAME,
          tileUrlTemplate: env.MAP_TILE_URL,
          attributionText: env.MAP_ATTRIBUTION_TEXT,
          attributionUrl: env.MAP_ATTRIBUTION_URL,
        }
      : defaultMapProvider),
    maxZoom: env.MAP_MAX_ZOOM === undefined ? 19 : Number(env.MAP_MAX_ZOOM),
  });
}
