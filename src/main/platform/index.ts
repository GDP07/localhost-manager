import os from 'os';
import { PlatformAdapter } from './PlatformAdapter';
import { MacOSAdapter } from './macos/MacOSAdapter';
import { WindowsAdapter } from './windows/WindowsAdapter';
import { LinuxAdapter } from './linux/LinuxAdapter';

let currentAdapter: PlatformAdapter | null = null;

export function getPlatformAdapter(): PlatformAdapter {
  if (currentAdapter) return currentAdapter;

  const platform = os.platform();
  const adapter: PlatformAdapter =
    platform === 'darwin'
      ? new MacOSAdapter()
      : platform === 'win32'
        ? new WindowsAdapter()
        : new LinuxAdapter();

  currentAdapter = adapter;
  return adapter;
}

export * from './PlatformAdapter';
