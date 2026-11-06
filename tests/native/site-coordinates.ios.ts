import { execFileSync } from 'node:child_process';
import { iosSmokeFlows } from './ios-smoke-flows';
import { openFixture } from './smoke-fixture';

const device = process.argv[2];
const flow = iosSmokeFlows(device, {});
const { manager, setAvailable } = await openFixture();
const coordinates = { latitude: 0, longitude: -106.8 };
const site = await manager.createSite('Native coordinate site', 'Synthetic site', coordinates);
const order = await manager.createOrder({
  title: 'Saved site coordinates iOS QA',
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
const label = `${order.reference}: ${order.title}`;
await flow('site-coordinates-cache.ios.yaml', { ORDER_NAME: `Open ${label}` });
try {
  await setAvailable(false);
  execFileSync('xcrun', ['simctl', 'pbcopy', device], {
    input: 'Synthetic clipboard seed',
    timeout: 10000,
  });
  await flow('site-coordinates-offline.ios.yaml', {
    ORDER_NAME: `Open ${label}`,
    ORDER_NAME_ID: `Buka ${label}`,
  });
  const copied = execFileSync('xcrun', ['simctl', 'pbpaste', device], {
    encoding: 'utf8',
    timeout: 10000,
  });
  if (copied !== '0, -106.8') throw new Error('Clipboard did not contain the saved coordinates.');
} finally {
  await setAvailable(true);
}
