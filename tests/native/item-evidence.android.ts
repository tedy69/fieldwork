import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createClient } from '@fieldwork/sdk';

const device = process.argv[2] ?? '';
if (!device.startsWith('emulator-')) throw new Error('Pass a dedicated Android emulator ID.');
const adb = process.env.ADB ?? 'adb';
const metro = process.env.METRO_URL ?? 'exp://127.0.0.1:8082';
const port = Number(process.env.FIELDWORK_DESIGN_TEST_PORT ?? 4180);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('Choose a valid fixture port.');
const base = `http://127.0.0.1:${port}`;
const status = await fetch(`${base}/__design-test__/state`, { signal: AbortSignal.timeout(5000) });
if (!status.ok) throw new Error('Start the isolated design fixture first.');
const fixture = await status.json();
if (fixture.fixture !== 'synthetic-native-design' || !fixture.available)
  throw new Error('Use an available synthetic design fixture.');

const session = await createClient(base).login('manager@fieldwork.local', 'fieldwork-demo');
const manager = createClient(base, () => session.token);
const template = await manager.createTemplate('Item evidence smoke checklist', [
  { label: 'Check valve', responseType: 'check', requiresPhoto: true },
]);
const order = await manager.createOrder({
  title: 'Item evidence smoke visit',
  instructions: 'Synthetic photo evidence fixture.',
  siteId: 'north',
  assigneeId: 'worker',
  templateId: template.id,
  dueDate: '2026-12-28',
  priority: 'routine',
});
const summary = 'Valve checked';
function run(command: string, args: string[], timeout: number) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', timeout });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${signal ?? code}.`));
    });
  });
}
function flow(name: string) {
  return run(
    'maestro',
    [
      '--device',
      device,
      'test',
      '-e',
      `ORDER_NAME=Open ${order.reference}: ${order.title}`,
      '-e',
      `METRO_URL=${metro}`,
      fileURLToPath(new URL(name, import.meta.url)),
    ],
    180_000,
  );
}
async function network(available: boolean) {
  const result = await fetch(`${base}/__design-test__/network`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Connection: 'close' },
    body: JSON.stringify({ available }),
    signal: AbortSignal.timeout(5000),
  });
  if (!result.ok) throw new Error('Could not switch the synthetic API availability.');
  const state = await result.json();
  if (state.available !== available) throw new Error('The synthetic API state did not change.');
}
await flow('item-evidence-attach.android.yaml');
// Use Android keyboard input around Maestro's Android typing issue.
await run(adb, ['-s', device, 'shell', 'input', 'text', summary.replaceAll(' ', '%s')], 30000);
try {
  await network(false);
  await flow('item-evidence-outage.android.yaml');
} finally {
  await network(true);
}
await flow('item-evidence-reconnect.android.yaml');
const [saved, history] = await Promise.all([
  manager.order(order.id),
  manager.reportHistory(order.id),
]);
const itemId = template.items[0].id;
if (
  saved.status !== 'SUBMITTED' ||
  saved.version !== 2 ||
  saved.report?.summary !== summary ||
  saved.report.photos.length !== 1 ||
  saved.report.photos[0].itemId !== itemId ||
  history.total !== 1 ||
  history.data[0]?.snapshot.report.photos[0]?.itemId !== itemId
)
  throw new Error('Expected one saved revision with the photo linked to its question.');
console.log(`${order.reference} synced once with its item photo.`);
