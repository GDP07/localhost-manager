import { PlatformAdapter } from '../platform/PlatformAdapter';
import { ConfigService } from './ConfigService';
import { DevSupervisor, ProcessSupervisor, ProcessTreeNode, ServiceInfo } from '../../shared/types/service';

export class ProcessService {
  constructor(
    private platformAdapter: PlatformAdapter,
    private configService: ConfigService
  ) {}

  isDevelopmentProcess(
    processName: string,
    commandLine: string,
    projectName: string | null,
    framework: any
  ): boolean {
    if (framework || projectName) return true;

    const config = this.configService.getConfig();
    const pName = processName.toLowerCase();
    const cmd = commandLine.toLowerCase();

    for (const devName of config.customDevProcessNames) {
      if (pName.includes(devName.toLowerCase()) || cmd.includes(devName.toLowerCase())) {
        return true;
      }
    }

    return false;
  }

  detectOrphan(
    ppid: number | null,
    parentName: string | null,
    isDevProcess: boolean,
    supervisor: ProcessSupervisor | null
  ): { isOrphan: boolean; reason: string | null } {
    if (!isDevProcess) return { isOrphan: false, reason: null };

    // A supervised job is *meant* to be parented to the service manager. Reporting it
    // as orphaned is a false positive, and its Stop button cannot make it stay stopped.
    if (supervisor) return { isOrphan: false, reason: null };

    const config = this.configService.getConfig();
    const pName = (parentName || '').toLowerCase();

    if (ppid === 1 || config.orphanParentProcessNames.some((n) => pName.includes(n.toLowerCase()))) {
      return {
        isOrphan: true,
        reason: `Reparented to ${parentName || 'init'}, which usually means the terminal that started it has closed`
      };
    }

    return { isOrphan: false, reason: null };
  }

  async getProcessTree(pid: number): Promise<ProcessTreeNode | null> {
    return this.platformAdapter.getProcessTree(pid);
  }

  /** The parent that would respawn `pid`, when there is one. */
  async resolveStopTarget(pid: number): Promise<DevSupervisor | null> {
    return this.platformAdapter.resolveStopTarget(pid);
  }

  /**
   * Signal exactly this process and nothing else. Deliberately narrow: if the process is
   * supervised, the supervisor will replace it. Exposed so the UI can offer that as a
   * conscious choice, not as the default.
   */
  async stopProcess(pid: number, force = false): Promise<boolean> {
    return this.platformAdapter.terminateProcess(pid, force);
  }

  /** Stop the whole job — the supervisor above `pid` and everything beneath it. */
  async stopProcessTree(pid: number, force = false): Promise<boolean> {
    return this.platformAdapter.terminateProcessTree(pid, force);
  }

  async stopAllDevProcesses(services: ServiceInfo[]): Promise<{ stoppedCount: number; failedCount: number; stoppedPids: number[] }> {
    let stoppedCount = 0;
    let failedCount = 0;
    const stoppedPids: number[] = [];

    // Supervised services are excluded: launchd/systemd would restart them immediately,
    // so including them would inflate the count with stops that did not stick.
    const devServices = services.filter((s) => s.isDevProcess && !s.supervisor);
    const seenPids = new Set<number>();
    const seenJobs = new Set<number>();

    for (const service of devServices) {
      if (seenPids.has(service.pid)) continue;
      seenPids.add(service.pid);

      // Two ports can belong to one job (an API and its watcher under a single
      // `npm run dev`). Stopping it once frees both; stopping it twice would report the
      // second attempt as a failure against a pid that is already gone.
      const jobRoot = service.devSupervisor?.pid ?? service.pid;
      if (seenJobs.has(jobRoot)) continue;
      seenJobs.add(jobRoot);

      try {
        const ok = await this.platformAdapter.terminateProcessTree(service.pid, false);
        if (ok) {
          stoppedCount++;
          stoppedPids.push(service.pid);
        } else {
          failedCount++;
        }
      } catch {
        failedCount++;
      }
    }

    return { stoppedCount, failedCount, stoppedPids };
  }
}
