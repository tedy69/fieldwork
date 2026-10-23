# Site coordinates and maps

Managers can add optional latitude and longitude when creating a site in **Sites & checklists**. Enter both values or leave both empty. Values are decimal degrees, with latitude from −90 to 90 and longitude from −180 to 180. Zero is valid. The app does not geocode addresses or request a device location.

Coordinates follow existing workspace catalog permissions: signed-in workers can read catalog sites. Add a location only when it should be shared with that workspace. This remains a single-workspace server.

New assignments, including recurring occurrences, embed coordinates in their ordinary site snapshot. Existing assignments and report snapshots remain unchanged. Native clients can store the optional data with their existing order cache; this increment adds the map viewer to the web app.

## View a location

A location card appears for a site or assignment with saved coordinates. Coordinates remain readable from saved work after an offline reload. The card loads first-party provider settings, names the provider, and explains what tile requests share. It contacts that provider only after **Load site map**.

The map shows the saved point, visible attribution, and shared Kokonut/shadcn zoom, recenter, and hide controls. Focus it to pan with arrow keys or zoom with +/−. Scroll-wheel zoom, inertia, and animated pan/zoom are disabled. Keyboard handlers stay on the map element, away from checklist answers. **Hide site map** returns focus to its launcher. Leaving the order, signing out, or going offline removes the map; reconnecting does not automatically reopen it.

Provider settings, map-tool downloads, and tile failures have separate recovery actions. A disabled provider leaves coordinates readable. Raster maps use Web Mercator and do not display latitudes beyond ±85.05112878; those geographic coordinates can still be saved without showing an inaccurate map.

## Provider configuration

The default is OpenStreetMap Standard raster tiles. Its [tile policy](https://operations.osmfoundation.org/policies/tiles/) requires visible attribution, a valid browser Referer, ordinary HTTP caching, and interactive viewport use. It prohibits bulk/prefetch downloads. Fieldwork gives tile images `referrerPolicy="strict-origin-when-cross-origin"`, overriding the stricter document default for those requests. Browser caching honors provider headers; the service worker precaches local assets and licenses, not remote tiles. Tile requests share the viewed area, network address, and app origin.

Map-tool recovery saves the current report draft before reloading. It blocks reloads during report actions, after a failed draft save, or while a manager review or workspace form has unsaved text. Hiding the map while that save is pending cancels navigation.

Set `MAPS_ENABLED=false` to disable tile maps. To change raster providers without rebuilding the web app, set all four fields, restart the API, and reload open web tabs:

```dotenv
MAP_PROVIDER_NAME=Your tile provider
MAP_TILE_URL=https://tiles.example.com/{z}/{x}/{y}.png
MAP_ATTRIBUTION_TEXT=Provider attribution
MAP_ATTRIBUTION_URL=https://example.com/attribution
MAP_MAX_ZOOM=19
```

These URLs are placeholders. Use your provider's real URL, attribution, and terms. Supported templates use HTTPS with exactly one each of `{z}`, `{x}`, and `{y}`, no embedded credentials, no other placeholders, and no fragment. Maximum zoom is 1–19. Incomplete custom attribution or invalid settings fail startup. Tile URLs are public browser configuration; use only client-visible provider keys when required.

Leaflet is pinned to 1.9.4, the stable release on its [download page](https://leafletjs.com/download.html). Its [API reference](https://leafletjs.com/reference.html) documents the integration methods. The BSD 2-Clause notice ships at `/licenses/leaflet-BSD-2-Clause.txt` and is available offline. Leaflet executes through a separate chunk when a map opens; that local chunk is included in the asset precache.

## API and persistence

`POST /api/v1/sites` keeps `name`/`address` and accepts optional `coordinates: { latitude, longitude }`. Both numeric fields are required when the object is present; strings, null, extra keys, and out-of-range values return 422. Manager and cookie-origin checks remain. The SDK adds an optional third parameter: `client.createSite(name, address, coordinates?)`.

`GET /api/v1/map-settings`, through `client.mapSettings()`, returns `{ provider }` for a signed-in account. A disabled provider returns null. Provider fields are `name`, `tileUrlTemplate`, `attributionText`, `attributionUrl`, and `maxZoom`; site coordinates and server environment variables are not part of this response. The SDK validates settings before map use.

No table or migration marker changes. Optional fields extend existing catalog/order JSON contracts. Tests reopen older records unchanged, retain new coordinates across restart, and preserve assignment/report coordinates after catalog changes. Map viewing does not alter inspection contents, queue reports, or change assignment versions. Reload recovery uses the existing draft repository to confirm persistence first.

## Contributor entry points and verification

- Domain contracts/transport: `packages/contracts/src/index.ts` and `packages/sdk/src/index.ts`.
- Site/provider API: `apps/api/src/app.ts`, `map-settings.ts`, and `main.ts`.
- Web form parsing: `apps/web/src/coordinate-input.ts` and `Resources.tsx`.
- Account-scoped settings and viewer: `MapSettings.tsx`, `SiteLocation.tsx`, `SiteMap.tsx`, and `site-location.css`.
- Domain, permission, persistence, and input cases: `tests/site-maps.test.ts`, `tests/coordinate-input.test.ts`, and `tests/sdk.test.ts`.
- Opt-in requests, keyboard controls, no device geolocation, referrers, attribution links, errors, and offline photo drafts: `tests/e2e/site-maps.spec.ts`.

Browser tests intercept every tile request and use visibly labeled synthetic tiles. They do not pan/zoom against public tiles or certify provider availability. Verify your configured provider from a normal browser before deployment. Existing-site editing, changing an assignment's site snapshot, native map screens, GPS, directions, offline map downloads, physical-device checks, and full screen-reader acceptance remain separate work.
