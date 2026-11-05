import { iosSmokeFlows } from './ios-smoke-flows';
import { openFixture } from './smoke-fixture';

const flow = iosSmokeFlows(process.argv[2], {});
const { setAvailable } = await openFixture();
try {
  await setAvailable(false);
  await flow('assignment-status-filter.ios.yaml');
} finally {
  await setAvailable(true);
}
