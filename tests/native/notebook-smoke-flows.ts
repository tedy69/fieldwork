import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { iosSmokeFlows } from './ios-smoke-flows';
import { run } from './smoke-fixture';

export function notebookSmokeFlows(device: string | undefined) {
  if (!device) throw new Error('Pass the ID of a dedicated iOS simulator or Android emulator.');
  const android = /^emulator-\d+$/.test(device);
  if (!android) return { android, flow: iosSmokeFlows(device, {}) };

  const adb = process.env.ADB ?? 'adb';
  const emulator = execFileSync(adb, ['-s', device, 'shell', 'getprop', 'ro.kernel.qemu'], {
    encoding: 'utf8',
    timeout: 10_000,
  }).trim();
  if (emulator !== '1') throw new Error('Use a booted Android emulator.');

  return {
    android,
    flow: (name: string, variables: Record<string, string> = {}) =>
      run(
        'maestro',
        [
          '--device',
          device,
          'test',
          ...Object.entries(variables).flatMap(([key, value]) => ['-e', `${key}=${value}`]),
          fileURLToPath(new URL(name, import.meta.url)),
        ],
        180_000,
      ),
  };
}
