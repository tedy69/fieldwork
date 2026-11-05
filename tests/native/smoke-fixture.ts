import { spawn } from 'node:child_process';
import { createClient } from '@fieldwork/sdk';

export async function openFixture() {
  const port = Number(process.env.FIELDWORK_DESIGN_TEST_PORT ?? 4180);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('Choose a valid fixture port.');
  const base = `http://127.0.0.1:${port}`;
  const status = await fetch(`${base}/__design-test__/state`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!status.ok) throw new Error('Start the isolated design fixture first.');
  const fixture = await status.json();
  if (fixture.fixture !== 'synthetic-native-design' || !fixture.available)
    throw new Error('Use an available synthetic design fixture.');
  const session = await createClient(base).login('manager@fieldwork.local', 'fieldwork-demo');
  return {
    baseUrl: base,
    manager: createClient(base, () => session.token),
    async setAvailable(available: boolean) {
      const result = await fetch(`${base}/__design-test__/network`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Connection: 'close' },
        body: JSON.stringify({ available }),
        signal: AbortSignal.timeout(5000),
      });
      if (!result.ok) throw new Error('Could not switch the synthetic API availability.');
      const state = await result.json();
      if (state.available !== available) throw new Error('The synthetic API state did not change.');
    },
  };
}

export function run(command: string, args: string[], timeout: number) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', timeout });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${signal ?? code}.`));
    });
  });
}
