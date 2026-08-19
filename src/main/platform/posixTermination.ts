import { RawProcessInfo } from './PlatformAdapter';
import { ancestryOf, collectJobPids, resolveSupervisionRoot } from './supervision';

/**
 * Stopping a job on POSIX. Shared by the macOS and Linux adapters, which differ in how
 * they *read* the process table but not at all in how they signal it.
 */

const GRACEFUL_WAIT_MS = 1500;
const FORCED_WAIT_MS = 2000;

const isAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: any) {
    // EPERM means it exists but belongs to another user, so it is still alive.
    return err.code === 'EPERM';
  }
};

async function waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return !isAlive(pid);
}

/**
 * Signal one process and report whether it actually died.
 *
 * Reporting honestly matters more than it looks: this result is what removes the row
 * from the UI, and a stop that timed out but claimed success made the service reappear
 * on the next poll — indistinguishable, from the user's side, from a respawn.
 */
export async function terminatePid(pid: number, force = false): Promise<boolean> {
  try {
    process.kill(pid, force ? 'SIGKILL' : 'SIGTERM');
  } catch (err: any) {
    if (err.code === 'ESRCH') return true; // already gone
    return false; // EPERM: not ours to signal
  }

  return waitForExit(pid, force ? FORCED_WAIT_MS : GRACEFUL_WAIT_MS);
}

/**
 * Stop the whole job that owns `startPid`, including the supervisor that would otherwise
 * respawn it.
 *
 * Order is the crux. Signalling the process group is preferred because delivery is
 * atomic across the group: a supervisor cannot observe a dead child and start a
 * replacement, because it is signalled in the same instant. Where that is not available
 * the sweep runs root-first for the same reason — killing children first is what gives a
 * live supervisor something to react to.
 */
export async function terminateJob(
  startPid: number,
  force: boolean,
  processes: Map<number, RawProcessInfo>
): Promise<boolean> {
  const protectedPids = ancestryOf(process.pid, processes);
  const { pid: rootPid } = resolveSupervisionRoot(startPid, processes, { protectedPids });
  const root = processes.get(rootPid);

  if (root?.pgid != null && root.pgid === root.pid) {
    try {
      // A negative pid addresses the whole process group.
      process.kill(-root.pgid, force ? 'SIGKILL' : 'SIGTERM');
    } catch {
      // Group gone or not ours; the per-pid sweep below still covers it.
    }
  }

  const jobPids = collectJobPids(rootPid, processes);
  const results = new Map<number, boolean>();
  for (const pid of jobPids) {
    results.set(pid, await terminatePid(pid, force));
  }

  if (force) return Array.from(results.values()).every(Boolean);

  // SIGTERM is a request, and a process is free to ignore it. Anything still holding on
  // after the grace period gets SIGKILL, so that Stop means stopped.
  const survivors = jobPids.filter((pid) => isAlive(pid));
  if (survivors.length === 0) return true;

  let allOk = true;
  for (const pid of survivors) {
    if (!(await terminatePid(pid, true))) allOk = false;
  }
  return allOk;
}
