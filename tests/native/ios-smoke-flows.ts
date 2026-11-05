import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { run } from './smoke-fixture';

export function iosSmokeFlows(id: string | undefined, variables: Record<string, string>) {
  const device = id?.toUpperCase() ?? '';
  const booted = JSON.parse(
    execFileSync('xcrun', ['simctl', 'list', 'devices', 'booted', '--json'], {
      encoding: 'utf8',
      timeout: 10000,
    }),
  ) as { devices: Record<string, { udid: string }[]> };
  const iosDevices = Object.entries(booted.devices)
    .filter(([runtime]) => runtime.startsWith('com.apple.CoreSimulator.SimRuntime.iOS-'))
    .flatMap(([, devices]) => devices);
  if (!device || !iosDevices.some(({ udid }) => udid === device))
    throw new Error('Pass the ID of a dedicated booted iOS simulator.');

  return (name: string, overrides: Record<string, string> = {}) =>
    run(
      'maestro',
      [
        '--device',
        device,
        'test',
        ...Object.entries({ ...variables, ...overrides }).flatMap(([key, value]) => [
          '-e',
          `${key}=${value}`,
        ]),
        fileURLToPath(new URL(name, import.meta.url)),
      ],
      180_000,
    );
}
