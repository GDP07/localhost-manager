import test from 'node:test';
import assert from 'node:assert';
import { execSync, spawn } from 'child_process';
import fs from 'fs';
import http from 'http';
import net from 'net';
import os from 'os';
import path from 'path';
import { ConfigService } from '../src/main/services/ConfigService';
import { HealthService } from '../src/main/services/HealthService';
import { ProcessService } from '../src/main/services/ProcessService';
import { MacOSAdapter } from '../src/main/platform/macos/MacOSAdapter';
import { RawProcessInfo } from '../src/main/platform/PlatformAdapter';
import {
  collectJobPids,
  findDevSupervisor,
  resolveSupervisionRoot
} from '../src/main/platform/supervision';
import { ProcessSupervisor, ServiceInfo } from '../src/shared/types/service';

const LAUNCHD: ProcessSupervisor = {
  kind: 'launchd',
  label: 'homebrew.mxcl.redis',
  stopHint: 'brew services stop redis'
};

/** ProcessService rooted in a throwaway config dir, so tests never touch ~/. */
function processService(): ProcessService {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lm-ps-'));
  return new ProcessService(new MacOSAdapter(), new ConfigService(dir));
}

/** launchd jobs that currently have a running process, straight from the OS. */
function launchdJobs(): { pid: number; label: string }[] {
  return execSync('launchctl list', { encoding: 'utf-8' })
    .split('\n')
    .map((line) => line.split('\t'))
    .filter(([pid, , label]) => /^\d+$/.test(pid ?? '') && Boolean(label))
    .map(([pid, , label]) => ({ pid: parseInt(pid, 10), label: label.trim() }));
}

async function withServer(
  handler: (socket: net.Socket) => void,
  fn: (port: number) => Promise<void>
): Promise<void> {
  const server = net.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as net.AddressInfo;
  try {
    await fn(port);
  } finally {
    server.close();
  }
}

/* -------------------------------------------------------------------------- *
 * Orphan detection vs. supervised services
 * -------------------------------------------------------------------------- */

test('detectOrphan - a launchd-supervised service is not an orphan', () => {
  // launchd is the intended parent of a supervised job, not a sign its terminal
  // session closed.
  const result = processService().detectOrphan(1, 'launchd', true, LAUNCHD);
  assert.strictEqual(result.isOrphan, false);
  assert.strictEqual(result.reason, null);
});

test('detectOrphan - an unsupervised process reparented to launchd is still an orphan', () => {
  const result = processService().detectOrphan(1, 'launchd', true, null);
  assert.strictEqual(result.isOrphan, true);
  assert.match(result.reason ?? '', /terminal/i);
});

test('detectOrphan - a non-dev process is never flagged', () => {
  assert.strictEqual(processService().detectOrphan(1, 'launchd', false, null).isOrphan, false);
});

test('stopAllDevProcesses - skips supervised services that would just respawn', async () => {
  const base = { isDevProcess: true, cpu: 0, memoryBytes: 0 } as unknown as ServiceInfo;
  const services: ServiceInfo[] = [
    { ...base, id: 'supervised', pid: 999_001, supervisor: LAUNCHD },
    { ...base, id: 'plain', pid: 999_002, supervisor: null },
    { ...base, id: 'not-dev', pid: 999_003, isDevProcess: false, supervisor: null }
  ];

  const result = await processService().stopAllDevProcesses(services);

  // Only the unsupervised dev process is attempted. Pid 999_002 does not exist, so
  // terminate reports success (ESRCH means "already gone").
  assert.deepStrictEqual(result.stoppedPids, [999_002]);
  assert.strictEqual(result.stoppedCount + result.failedCount, 1);
});

/* -------------------------------------------------------------------------- *
 * Reading supervision from the real system
 * -------------------------------------------------------------------------- */

test('getSupervisedProcesses - identifies real launchd jobs and ignores plain processes', async () => {
  const adapter = new MacOSAdapter();
  const jobs = launchdJobs();

  if (jobs.length === 0) {
    assert.ok((await adapter.getSupervisedProcesses([process.pid])) instanceof Map);
    return;
  }

  const { pid, label } = jobs[0];
  const found = await adapter.getSupervisedProcesses([pid, process.pid]);

  assert.strictEqual(found.get(pid)?.kind, 'launchd');
  assert.strictEqual(found.get(pid)?.label, label);

  // A stop hint is offered for user-managed jobs only; Apple's own are covered by the
  // dedicated test below.
  if (!label.startsWith('com.apple.')) {
    assert.ok(found.get(pid)?.stopHint, `expected a stop hint for ${label}`);
  }

  // This test runs as a plain node process, not a launchd job.
  assert.strictEqual(found.has(process.pid), false);
});

test('getSupervisedProcesses - homebrew labels get a `brew services stop` hint', async () => {
  const brew = launchdJobs().find((j) => j.label.startsWith('homebrew.mxcl.'));
  if (!brew) return; // no brew services on this machine

  const found = await new MacOSAdapter().getSupervisedProcesses([brew.pid]);
  const service = brew.label.replace('homebrew.mxcl.', '');
  assert.strictEqual(found.get(brew.pid)?.stopHint, `brew services stop ${service}`);
});

test('getSupervisedProcesses - an empty pid list makes no system call', async () => {
  assert.strictEqual((await new MacOSAdapter().getSupervisedProcesses([])).size, 0);
});

/* -------------------------------------------------------------------------- *
 * Probe modes
 * -------------------------------------------------------------------------- */

test('checkHealth - skip mode never touches the network', async () => {
  // UDP listeners do not accept TCP, so probing them reported healthy services as
  // unreachable. They are not probed at all now.
  const res = await new HealthService().checkHealth(59_997, 'skip');
  assert.deepStrictEqual(res, { status: 'unknown', responseTimeMs: null });
});

test('checkHealth - tcp mode reports a closed port as unreachable', async () => {
  assert.strictEqual((await new HealthService().checkHealth(59_996, 'tcp')).status, 'unreachable');
});

test('checkHealth - tcp mode reports an open port healthy without sending any bytes', async () => {
  const received: Buffer[] = [];

  await withServer(
    (socket) => socket.on('data', (chunk) => received.push(chunk)),
    async (port) => {
      const res = await new HealthService().checkHealth(port, 'tcp');
      assert.strictEqual(res.status, 'healthy');
      assert.strictEqual(typeof res.responseTimeMs, 'number');

      // The whole point of tcp mode: Postgres and Redis must not receive an HTTP
      // request and log a protocol error on every poll.
      await new Promise((r) => setTimeout(r, 150));
      assert.strictEqual(received.length, 0, 'tcp probe must not write to the socket');
    }
  );
});

test('checkHealth - http mode reports a real server as healthy', async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200);
    res.end('ok');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as net.AddressInfo;

  try {
    assert.strictEqual((await new HealthService().checkHealth(port, 'http')).status, 'healthy');
  } finally {
    server.close();
  }
});

test('checkHealth - a 5xx reads as starting, since dev servers 500 while compiling', async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(503);
    res.end('compiling');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as net.AddressInfo;

  try {
    assert.strictEqual((await new HealthService().checkHealth(port, 'http')).status, 'starting');
  } finally {
    server.close();
  }
});

test('checkHealth - the cache is keyed by mode, not just port', async () => {
  const health = new HealthService();
  await withServer(
    () => {},
    async (port) => {
      const tcp = await health.checkHealth(port, 'tcp');
      const skipped = await health.checkHealth(port, 'skip');
      assert.strictEqual(tcp.status, 'healthy');
      assert.strictEqual(skipped.status, 'unknown');
    }
  );
});

test('getSupervisedProcesses - never suggests booting out an Apple system service', async () => {
  // Printing "launchctl bootout .../com.apple.controlcenter" next to a system daemon
  // would be inviting the user to break their machine.
  const apple = launchdJobs().find((j) => j.label.startsWith('com.apple.'));
  if (!apple) return;

  const found = await new MacOSAdapter().getSupervisedProcesses([apple.pid]);
  const entry = found.get(apple.pid);

  assert.strictEqual(entry?.kind, 'launchd');
  assert.strictEqual(entry?.stopHint, undefined, `must not offer a stop command for ${apple.label}`);
});

/* -------------------------------------------------------------------------- *
 * Resolving what a stop should target
 *
 * The port holder is frequently a child of the process that owns it: `php artisan
 * serve` runs `php -S` and restarts it on exit, `npm run dev` runs the real server
 * through a shell. Killing the child is a no-op with extra steps.
 * -------------------------------------------------------------------------- */

function proc(over: Partial<RawProcessInfo> & { pid: number }): RawProcessInfo {
  return {
    ppid: null,
    pgid: over.pid,
    name: 'node',
    commandLine: 'node',
    executablePath: '/usr/bin/node',
    user: 'dev',
    cpu: 0,
    memoryBytes: 0,
    cwd: null,
    parentName: null,
    ...over
  };
}

const table = (...procs: RawProcessInfo[]) => new Map(procs.map((p) => [p.pid, p]));

/** The reported case: `php artisan serve` (200) supervising `php -S :8003` (300). */
const artisanTable = () =>
  table(
    proc({ pid: 100, ppid: 1, pgid: 100, name: 'zsh', commandLine: '-zsh' }),
    proc({ pid: 200, ppid: 100, pgid: 200, name: 'php', commandLine: 'php artisan serve' }),
    proc({ pid: 300, ppid: 200, pgid: 200, name: 'php', commandLine: 'php -S 127.0.0.1:8003' })
  );

test('resolveSupervisionRoot - climbs from the port holder to the supervisor that respawns it', () => {
  assert.strictEqual(resolveSupervisionRoot(300, artisanTable()).pid, 200);
});

test('resolveSupervisionRoot - stops at the shell, which is a different process group', () => {
  // The shell must survive: it is the user's session, not part of the job.
  const root = resolveSupervisionRoot(300, artisanTable());
  assert.strictEqual(root.pid, 200);
  assert.deepStrictEqual(root.chain.map((p) => p.pid), [200]);
});

test('resolveSupervisionRoot - an interactive shell is a boundary even when it shares a pgid', () => {
  // Without job control a shell and its child share a process group, so the pgid fence
  // alone would walk straight into the user's shell and kill it.
  const shared = table(
    proc({ pid: 100, ppid: 1, pgid: 100, name: 'zsh', commandLine: '/bin/zsh -i' }),
    proc({ pid: 300, ppid: 100, pgid: 100, name: 'node', commandLine: 'node server.js' })
  );
  assert.strictEqual(resolveSupervisionRoot(300, shared).pid, 300);
});

test('resolveSupervisionRoot - a shell running a script is crossed, since it is the supervisor', () => {
  const script = table(
    proc({ pid: 100, ppid: 1, pgid: 100, name: 'zsh', commandLine: '-zsh' }),
    proc({ pid: 200, ppid: 100, pgid: 200, name: 'sh', commandLine: 'sh ./start-dev.sh' }),
    proc({ pid: 300, ppid: 200, pgid: 200, name: 'node', commandLine: 'node server.js' })
  );
  assert.strictEqual(resolveSupervisionRoot(300, script).pid, 200);
});

test('resolveSupervisionRoot - never crosses an editor hosting an integrated terminal', () => {
  const ide = table(
    proc({ pid: 50, ppid: 1, pgid: 50, name: 'Code Helper', commandLine: 'Code Helper' }),
    proc({ pid: 300, ppid: 50, pgid: 50, name: 'node', commandLine: 'node server.js' })
  );
  assert.strictEqual(resolveSupervisionRoot(300, ide).pid, 300);
});

test('resolveSupervisionRoot - never crosses a container runtime', () => {
  const docker = table(
    proc({ pid: 60, ppid: 1, pgid: 60, name: 'com.docker.backend', commandLine: 'com.docker.backend' }),
    proc({ pid: 300, ppid: 60, pgid: 60, name: 'node', commandLine: 'node server.js' })
  );
  assert.strictEqual(resolveSupervisionRoot(300, docker).pid, 300);
});

test('resolveSupervisionRoot - never climbs into our own process', () => {
  // A server started by the app itself is our child. Walking up would have the app
  // terminate itself the moment a user pressed Stop.
  const ours = table(
    proc({ pid: 42, ppid: 1, pgid: 42, name: 'Electron', commandLine: 'Electron' }),
    proc({ pid: 300, ppid: 42, pgid: 42, name: 'node', commandLine: 'node server.js' })
  );
  const root = resolveSupervisionRoot(300, ours, { protectedPids: new Set([42]) });
  assert.strictEqual(root.pid, 300);
});

test('resolveSupervisionRoot - a parent chain that loops does not hang', () => {
  const cyclic = table(
    proc({ pid: 300, ppid: 400, pgid: 900, name: 'node', commandLine: 'node a' }),
    proc({ pid: 400, ppid: 300, pgid: 900, name: 'node', commandLine: 'node b' })
  );
  assert.ok([300, 400].includes(resolveSupervisionRoot(300, cyclic).pid));
});

test('resolveSupervisionRoot - a pid missing from the table resolves to itself', () => {
  assert.strictEqual(resolveSupervisionRoot(999_999, artisanTable()).pid, 999_999);
});

test('resolveSupervisionRoot - a reparented supervisor is still found, and the walk ends at init', () => {
  // The launching shell is gone, so the supervisor's ppid is 1 and its pgid names a
  // process group whose leader no longer exists.
  const orphaned = table(
    proc({ pid: 200, ppid: 1, pgid: 150, name: 'sh', commandLine: 'sh ./serve.sh' }),
    proc({ pid: 300, ppid: 200, pgid: 150, name: 'node', commandLine: 'node server.js' })
  );
  assert.strictEqual(resolveSupervisionRoot(300, orphaned).pid, 200);
});

test('resolveSupervisionRoot - without process groups it needs the command to look like a supervisor', () => {
  // Windows reports no pgid, and its ppid can point at a recycled pid, so a bare parent
  // is not enough evidence to widen a kill.
  const win = (parentCmd: string) =>
    table(
      proc({ pid: 200, ppid: 1, pgid: null, name: 'node.exe', commandLine: parentCmd }),
      proc({ pid: 300, ppid: 200, pgid: null, name: 'node.exe', commandLine: 'node server.js' })
    );

  assert.strictEqual(resolveSupervisionRoot(300, win('npm run dev')).pid, 200);
  assert.strictEqual(resolveSupervisionRoot(300, win('nodemon index.js')).pid, 200);
  assert.strictEqual(resolveSupervisionRoot(300, win('node unrelated-tool.js')).pid, 300);
});

test('findDevSupervisor - reports nothing when the port holder is already the top of its job', () => {
  const solo = table(proc({ pid: 300, ppid: 1, pgid: 300, commandLine: 'node server.js' }));
  assert.strictEqual(findDevSupervisor(300, solo), null);
});

test('findDevSupervisor - names the supervisor so the UI can explain the wider stop', () => {
  const found = findDevSupervisor(300, artisanTable());
  assert.strictEqual(found?.pid, 200);
  assert.strictEqual(found?.commandLine, 'php artisan serve');
});

test('collectJobPids - lists the root first, so it cannot respawn a child mid-sweep', () => {
  const pids = collectJobPids(200, artisanTable());
  assert.strictEqual(pids[0], 200);
  assert.deepStrictEqual(pids.sort(), [200, 300]);
});

test('collectJobPids - a group leader also sweeps processes that double-forked out of the tree', () => {
  const escaped = table(
    proc({ pid: 200, ppid: 1, pgid: 200, commandLine: 'npm run dev' }),
    proc({ pid: 300, ppid: 200, pgid: 200, commandLine: 'node server.js' }),
    // Reparented to init, so no longer a descendant — but still in the job's group.
    proc({ pid: 400, ppid: 1, pgid: 200, commandLine: 'node worker.js' })
  );
  assert.deepStrictEqual(collectJobPids(200, escaped).sort(), [200, 300, 400]);
});

test('collectJobPids - an unrelated process in another group is left alone', () => {
  const mixed = table(
    proc({ pid: 200, ppid: 1, pgid: 200, commandLine: 'npm run dev' }),
    proc({ pid: 300, ppid: 200, pgid: 200, commandLine: 'node server.js' }),
    proc({ pid: 700, ppid: 1, pgid: 700, commandLine: 'node someone-elses-server.js' })
  );
  assert.strictEqual(collectJobPids(200, mixed).includes(700), false);
});

/* -------------------------------------------------------------------------- *
 * End to end, against a real respawning supervisor
 * -------------------------------------------------------------------------- */

/**
 * A stand-in for `php artisan serve`: it runs a server as a child and starts a fresh one
 * whenever that child exits. Spawned detached so it leads its own process group, which
 * is what an interactive shell does for every job it starts.
 */
function startSupervisedServer(port: number): { pid: number; dir: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lm-sup-'));
  const script = path.join(dir, 'serve.sh');
  const server =
    `require('http').createServer((_q,s)=>s.end('ok')).listen(${port},'127.0.0.1')`;

  fs.writeFileSync(
    script,
    `#!/bin/sh\nwhile true; do\n  "${process.execPath}" -e "${server}"\n  sleep 0.2\ndone\n`,
    { mode: 0o755 }
  );

  const child = spawn(script, [], { detached: true, stdio: 'ignore' });
  child.unref();
  return { pid: child.pid as number, dir };
}

/** The pid currently listening on `port`, or null. */
function pidOnPort(port: number): number | null {
  try {
    const out = execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t`, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    const pid = parseInt(out.split('\n')[0], 10);
    return Number.isFinite(pid) ? pid : null;
  } catch {
    return null; // lsof exits non-zero when nothing is listening
  }
}

async function waitFor<T>(fn: () => T, timeoutMs: number): Promise<T | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = fn();
    if (value) return value;
    await new Promise((r) => setTimeout(r, 100));
  }
  return null;
}

/** Tear the whole group down whatever the test did, so nothing is left listening. */
function cleanup(pid: number, dir: string): void {
  try {
    process.kill(-pid, 'SIGKILL');
  } catch {}
  try {
    process.kill(pid, 'SIGKILL');
  } catch {}
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
}

test('a supervised server comes straight back when only the port holder is killed', async () => {
  // This is the bug being fixed, asserted directly: without walking up the parent chain,
  // a stop frees the port for a moment and the supervisor rebinds it.
  const port = 59_431;
  const { pid: supervisorPid, dir } = startSupervisedServer(port);

  try {
    const first = await waitFor(() => pidOnPort(port), 8000);
    assert.ok(first, 'the supervised server never started listening');

    process.kill(first as number, 'SIGKILL');

    const second = await waitFor(() => {
      const now = pidOnPort(port);
      return now && now !== first ? now : null;
    }, 8000);

    assert.ok(second, 'expected the supervisor to start a replacement');
    assert.notStrictEqual(second, first);
  } finally {
    cleanup(supervisorPid, dir);
  }
});

test('stopping the port holder stops the supervisor with it, and the port stays free', async () => {
  const port = 59_432;
  const { pid: supervisorPid, dir } = startSupervisedServer(port);

  try {
    const holder = await waitFor(() => pidOnPort(port), 8000);
    assert.ok(holder, 'the supervised server never started listening');

    // The adapter is handed the *child* pid, exactly as the UI has it from lsof.
    const stopped = await new MacOSAdapter().terminateProcessTree(holder as number, false);
    assert.strictEqual(stopped, true);

    // Long enough for the supervisor's respawn loop to have run several times over.
    await new Promise((r) => setTimeout(r, 2500));
    assert.strictEqual(pidOnPort(port), null, 'the port was rebound, so the stop did not hold');

    // And the supervisor itself is gone, not merely childless.
    assert.throws(() => process.kill(supervisorPid, 0), /ESRCH/);
  } finally {
    cleanup(supervisorPid, dir);
  }
});

test('resolveSupervisionRoot - never crosses into a browser from one of its helpers', () => {
  // Found by running the app: Chrome puts its helpers in its own process group, so the
  // group fence alone read PID 665 as the "supervisor" of a helper holding a UDP port,
  // and Stop would have killed the user's browser.
  const chrome = table(
    proc({
      pid: 665,
      ppid: 1,
      pgid: 665,
      name: 'Google Chrome',
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      commandLine: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    }),
    proc({
      pid: 12_496,
      ppid: 665,
      pgid: 665,
      name: 'Google Chrome Helper',
      executablePath:
        '/Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Framework.framework/Versions/151/Helpers/Google Chrome Helper.app/Contents/MacOS/Google Chrome Helper',
      commandLine: '.../Google Chrome Helper --type=utility'
    })
  );

  assert.strictEqual(resolveSupervisionRoot(12_496, chrome).pid, 12_496);
  assert.strictEqual(findDevSupervisor(12_496, chrome), null);
});

test('resolveSupervisionRoot - an application bundle is never treated as a supervisor', () => {
  const bundled = table(
    proc({
      pid: 700,
      ppid: 1,
      pgid: 700,
      name: 'Slack',
      executablePath: '/Applications/Slack.app/Contents/MacOS/Slack',
      commandLine: '/Applications/Slack.app/Contents/MacOS/Slack'
    }),
    proc({ pid: 800, ppid: 700, pgid: 700, name: 'node', commandLine: 'node helper.js' })
  );
  assert.strictEqual(resolveSupervisionRoot(800, bundled).pid, 800);
});

test('resolveSupervisionRoot - a real supervisor is still crossed after the bundle rule', () => {
  // The guard must not be so broad that it defeats the feature.
  assert.strictEqual(resolveSupervisionRoot(300, artisanTable()).pid, 200);
});
