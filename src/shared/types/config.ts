export interface AppConfig {
  theme: 'dark' | 'light' | 'system';
  refreshIntervalMs: number; // e.g. 3000
  metricsIntervalMs: number; // e.g. 2000
  healthCheckIntervalMs: number; // e.g. 6000
  enableNotifications: boolean;
  enableTray: boolean;
  closeToTray: boolean;
  terminalEmulator?: string;
  customDevProcessNames: string[];
  orphanParentProcessNames: string[];
}

export const DEFAULT_CONFIG: AppConfig = {
  theme: 'dark',
  refreshIntervalMs: 3000,
  metricsIntervalMs: 2000,
  healthCheckIntervalMs: 6000,
  enableNotifications: true,
  enableTray: true,
  closeToTray: false,
  customDevProcessNames: [
    'node', 'npm', 'pnpm', 'yarn', 'bun', 'python', 'python3', 'php', 'ruby',
    'java', 'cargo', 'go', 'dotnet', 'docker', 'webpack', 'vite', 'next',
    'vite-node', 'tsx', 'nodemon', 'uvicorn', 'gunicorn', 'artisan', 'rails',
    'postgres', 'redis-server', 'mongod', 'mysqld', 'caddy', 'nginx', 'traefik'
  ],
  orphanParentProcessNames: [
    'launchd', 'init', 'systemd', 'explorer.exe', 'svchost.exe'
  ]
};
