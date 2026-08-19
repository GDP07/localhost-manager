import test from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ProjectService } from '../src/main/services/ProjectService';
import { HealthService } from '../src/main/services/HealthService';
import { ConfigService } from '../src/main/services/ConfigService';
import { MacOSAdapter } from '../src/main/platform/macos/MacOSAdapter';
import { HealthStatus } from '../src/shared/types/service';

test('ProjectService - detects Next.js from the command line alone', () => {
  const res = new ProjectService().detectProject(
    null,
    'node /Users/dev/shop/node_modules/.bin/next dev',
    'node',
    3000
  );

  assert.strictEqual(res.framework?.name, 'Next.js');
  assert.strictEqual(res.framework?.category, 'fullstack');
});

test('ProjectService - detects database services by port and process name', () => {
  const service = new ProjectService();

  const postgres = service.detectProject(null, 'postgres -D /data', 'postgres', 5432);
  assert.strictEqual(postgres.framework?.name, 'PostgreSQL');
  assert.strictEqual(postgres.framework?.category, 'database');

  const redis = service.detectProject(null, 'redis-server *:6379', 'redis-server', 6379);
  assert.strictEqual(redis.framework?.name, 'Redis');
});

test('ProjectService - detects FastAPI from a uvicorn command line', () => {
  const res = new ProjectService().detectProject(null, 'uvicorn main:app --port 8000', 'python', 8000);
  assert.strictEqual(res.framework?.name, 'FastAPI');
});

test('ProjectService - falls back to the process name when the command line is bare', () => {
  // A bare interpreter invocation carries no useful hint in its command line, so
  // the process name is what identifies it.
  const res = new ProjectService().detectProject(null, '/usr/bin/python3.12', 'python3', 8100);
  assert.strictEqual(res.framework?.name, 'Python');
});

test('ProjectService - reads the project name from package.json', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lm-project-'));
  try {
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name: 'checkout-api', dependencies: { express: '^4.19.0' } })
    );

    const res = new ProjectService().detectProject(dir, 'node server.js', 'node', 4000);
    assert.strictEqual(res.projectName, 'checkout-api');
    assert.strictEqual(res.framework?.name, 'Express');
    assert.strictEqual(res.projectPath, dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('HealthService - a refused port reports a status the UI knows how to render', async () => {
  // Every value HealthService can produce must be a value the UI knows how to render.
  const renderable: HealthStatus[] = ['healthy', 'starting', 'unreachable', 'unknown'];

  const res = await new HealthService().checkHealth(59_999);
  assert.ok(
    renderable.includes(res.status),
    `${res.status} is not a member of HealthStatus`
  );
});

test('HealthService - caches within its TTL', async () => {
  const health = new HealthService();
  const first = await health.checkHealth(59_998);
  const second = await health.checkHealth(59_998);
  assert.deepStrictEqual(first, second);
});

/** A ConfigService rooted in a throwaway directory, so tests never touch ~/. */
function withTempConfig<T>(fn: (configService: ConfigService, dir: string) => T): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lm-config-'));
  try {
    return fn(new ConfigService(dir), dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('ConfigService - exposes defaults and persists updates to disk', () => {
  withTempConfig((configService, dir) => {
    const config = configService.getConfig();
    assert.ok(Array.isArray(config.customDevProcessNames));
    assert.ok(config.customDevProcessNames.includes('node'));

    const updated = configService.updateConfig({ refreshIntervalMs: 4000 });
    assert.strictEqual(updated.refreshIntervalMs, 4000);

    const onDisk = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf-8'));
    assert.strictEqual(onDisk.refreshIntervalMs, 4000);
    assert.strictEqual(new ConfigService(dir).getConfig().refreshIntervalMs, 4000);
  });
});

test('ConfigService - announces changes so live consumers can re-arm', () => {
  // The poll timer must react to a live setting change, not just the value read at
  // startup.
  withTempConfig((configService) => {
    const events: { next: number; previous: number }[] = [];
    configService.on('config-changed', (next, previous) => {
      events.push({ next: next.refreshIntervalMs, previous: previous.refreshIntervalMs });
    });

    configService.updateConfig({ refreshIntervalMs: 5000 });
    configService.updateConfig({ refreshIntervalMs: 10000 });

    assert.deepStrictEqual(events, [
      { next: 5000, previous: 3000 },
      { next: 10000, previous: 5000 }
    ]);
  });
});

test('ConfigService - getConfig returns a copy, not the live object', () => {
  withTempConfig((configService) => {
    const snapshot = configService.getConfig();
    snapshot.refreshIntervalMs = 999_999;
    assert.notStrictEqual(configService.getConfig().refreshIntervalMs, 999_999);
  });
});

test('MacOSAdapter - enumerates listening ports without throwing', async () => {
  const ports = await new MacOSAdapter().getListeningPorts();
  assert.ok(Array.isArray(ports));

  for (const entry of ports) {
    assert.ok(entry.port > 0 && entry.port <= 65535, `port out of range: ${entry.port}`);
    assert.ok(entry.pid > 0, `pid out of range: ${entry.pid}`);
    assert.ok(entry.protocol === 'tcp' || entry.protocol === 'udp');
  }
});
