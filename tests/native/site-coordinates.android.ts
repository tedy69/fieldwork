import { execFileSync } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openFixture, run } from './smoke-fixture';

const device = process.argv[2] ?? '';
if (!/^emulator-\d+$/.test(device)) throw new Error('Pass a dedicated Android emulator ID.');
const adb = process.env.ADB ?? 'adb';
const emulator = execFileSync(adb, ['-s', device, 'shell', 'getprop', 'ro.kernel.qemu'], {
  encoding: 'utf8',
  timeout: 10000,
}).trim();
if (emulator !== '1') throw new Error('Use a booted Android emulator.');

const { manager, setAvailable } = await openFixture();
// Use a fresh pair so a previous run's clipboard cannot satisfy the paste assertion.
const longitude = Number(`-106.${String(randomInt(1, 1_000_000)).padStart(6, '0')}`);
const coordinates = { latitude: 0, longitude };
const site = await manager.createSite(
  'Android coordinate copy QA site',
  'Synthetic site',
  coordinates,
);
const order = await manager.createOrder({
  title: 'Saved coordinate copy Android QA',
  instructions: 'Synthetic location snapshot.',
  siteId: site.id,
  assigneeId: 'worker',
  templateId: 'routine',
  dueDate: '2026-12-28',
  priority: 'routine',
});
await manager.updateSiteLocation(site.id, {
  expectedCoordinates: coordinates,
  coordinates: { latitude: 1, longitude: -105.8 },
});

const orderName = `Open ${order.reference}: ${order.title}`;
const visibleCoordinates = `Latitude 0 · Longitude ${longitude}`;
const clipboardPattern = `^0, ${String(longitude).replace('.', '\\.')}$`;
const flow = (name: string) =>
  run(
    'maestro',
    [
      '--device',
      device,
      'test',
      '-e',
      `ORDER_NAME=${orderName}`,
      '-e',
      `COORDINATES_LABEL=${visibleCoordinates}`,
      '-e',
      `CLIPBOARD_PATTERN=${clipboardPattern}`,
      fileURLToPath(new URL(name, import.meta.url)),
    ],
    180_000,
  );

await flow('site-coordinates-cache.android.yaml');
try {
  await setAvailable(false);
  await flow('site-coordinates-copy.android.yaml');
  await run(adb, ['-s', device, 'shell', 'input', 'keyevent', 'KEYCODE_PASTE'], 10_000);
  await flow('site-coordinates-paste.android.yaml');
} finally {
  await setAvailable(true);
}
