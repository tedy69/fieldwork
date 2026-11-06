import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { localDate } from '@fieldwork/contracts';
import { iosSmokeFlows } from './ios-smoke-flows';
import { openFixture, run } from './smoke-fixture';

const device = process.argv[2];
if (!device) throw new Error('Pass the ID of a dedicated iOS simulator or Android emulator.');
const android = /^emulator-\d+$/.test(device);
let flow: ReturnType<typeof iosSmokeFlows>;
if (android) {
  const adb = process.env.ADB ?? 'adb';
  const emulator = execFileSync(adb, ['-s', device, 'shell', 'getprop', 'ro.kernel.qemu'], {
    encoding: 'utf8',
    timeout: 10_000,
  }).trim();
  if (emulator !== '1') throw new Error('Use a booted Android emulator.');
  flow = (name, variables) =>
    run(
      'maestro',
      [
        '--device',
        device,
        'test',
        ...Object.entries(variables ?? {}).flatMap(([key, value]) => ['-e', `${key}=${value}`]),
        fileURLToPath(new URL(name, import.meta.url)),
      ],
      180_000,
    );
} else {
  flow = iosSmokeFlows(device, {});
}

const { manager, setAvailable } = await openFixture();
const search = `DraftQA${randomUUID().slice(0, 6)}`;
const create = (title: string) =>
  manager.createOrder({
    title: `${search} ${title}`,
    instructions: 'Synthetic offline draft filter fixture.',
    siteId: 'north',
    assigneeId: 'worker',
    templateId: 'routine',
    dueDate: localDate(),
    priority: 'routine',
  });
const draft = await create('draft');
const blank = await create('untouched');
const variables = {
  APP_ID: android ? 'host.exp.exponent' : 'host.exp.Exponent',
  DRAFT_NAME: `Open ${draft.reference}: ${draft.title}`,
  ORDER_NAME: `Open ${blank.reference}: ${blank.title}`,
  SEARCH: search,
  SUMMARY: `Saved${search}`,
};
await flow(
  android ? 'site-coordinates-cache.android.yaml' : 'site-coordinates-cache.ios.yaml',
  variables,
);
try {
  await setAvailable(false);
  await flow('drafts-filter-offline.yaml', variables);
} finally {
  await setAvailable(true);
}
const saved = await manager.order(draft.id);
assert.equal(saved.status, 'ASSIGNED');
assert.equal((await manager.reportHistory(draft.id)).total, 0);
