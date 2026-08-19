import { EventEmitter } from 'events';
import { PlatformAdapter } from '../platform/PlatformAdapter';
import { ProjectService } from './ProjectService';
import { HealthService, ProbeMode } from './HealthService';
import { ProcessService } from './ProcessService';
import { ConfigService } from './ConfigService';
import { ServiceInfo } from '../../shared/types/service';
import { ancestryOf, findDevSupervisor } from '../platform/supervision';

export class PortService extends EventEmitter {
  private cachedServices: ServiceInfo[] = [];
  private isScanning = false;
  private pollTimer: NodeJS.Timeout | null = null;

  constructor(
    private platformAdapter: PlatformAdapter,
    private projectService: ProjectService,
    private healthService: HealthService,
    private processService: ProcessService,
    private configService: ConfigService
  ) {
    super();

    // Settings changes must take effect live, not on next launch.
    this.configService.on('config-changed', (next, previous) => {
      if (next.refreshIntervalMs !== previous.refreshIntervalMs && this.pollTimer) {
        this.armTimer();
      }
    });
  }

  startPolling(): void {
    if (this.pollTimer) return;
    this.refreshServices();
    this.armTimer();
  }

  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private armTimer(): void {
    if (this.pollTimer) clearInterval(this.pollTimer);
    const { refreshIntervalMs } = this.configService.getConfig();
    this.pollTimer = setInterval(() => {
      this.refreshServices();
    }, refreshIntervalMs || 3000);
  }

  getServices(): ServiceInfo[] {
    return this.cachedServices;
  }

  async refreshServices(): Promise<ServiceInfo[]> {
    if (this.isScanning) return this.cachedServices;
    this.isScanning = true;

    try {
      const rawPorts = await this.platformAdapter.getListeningPorts();
      const allProcesses = await this.platformAdapter.getAllProcesses();

      // Working directories drive project and framework detection, and are only
      // resolved for processes that actually hold a port — getAllProcesses leaves
      // them null because reading every process's cwd would be far too expensive.
      const pids = rawPorts.map((p) => p.pid);
      const [cwds, supervisors] = await Promise.all([
        this.platformAdapter.getProcessCwds(pids),
        this.platformAdapter.getSupervisedProcesses(pids)
      ]);

      // Resolved once per scan and reused for every port: walking the parent chain is
      // pure map lookups against the table already in hand, so it costs nothing extra.
      const protectedPids = ancestryOf(process.pid, allProcesses);

      const results: ServiceInfo[] = [];

      for (const entry of rawPorts) {
        let proc = allProcesses.get(entry.pid);
        if (!proc) {
          proc = await this.platformAdapter.getProcessDetails(entry.pid) || undefined;
        }

        const processName = proc?.name || entry.processNameHint || 'unknown';
        const commandLine = proc?.commandLine || processName;
        const executablePath = proc?.executablePath || '';
        const user = proc?.user || null;
        const ppid = proc?.ppid || null;
        const parentProcessName = proc?.parentName || null;
        const cpu = proc?.cpu || 0;
        const memoryBytes = proc?.memoryBytes || 0;
        const cwd = cwds.get(entry.pid) ?? proc?.cwd ?? null;

        // Project and Framework detection
        const projectInfo = this.projectService.detectProject(
          cwd,
          commandLine,
          processName,
          entry.port
        );

        // Dev Process detection
        const isDevProcess = this.processService.isDevelopmentProcess(
          processName,
          commandLine,
          projectInfo.projectName,
          projectInfo.framework
        );

        // Orphan detection, aware of service managers
        const supervisor = supervisors.get(entry.pid) ?? null;

        // A dev supervisor is a plain parent process that restarts this one, so a stop
        // aimed at the listed pid alone would not hold.
        const devSupervisor = findDevSupervisor(entry.pid, allProcesses, { protectedPids });
        const orphanInfo = this.processService.detectOrphan(
          ppid,
          parentProcessName,
          isDevProcess,
          supervisor
        );

        // Wildcard binds are reachable as localhost; IPv6 literals must be bracketed
        // or the resulting URL is unparseable ("http://::1:5432").
        const isWildcard = entry.address === '0.0.0.0' || entry.address === '::';
        const hostname = isWildcard
          ? 'localhost'
          : entry.address.includes(':')
            ? `[${entry.address}]`
            : entry.address;
        const url = `http://${hostname}:${entry.port}`;

        // Probe mode follows what the port can actually answer. Sending HTTP to
        // Postgres logs a protocol error on every poll; probing a UDP listener over
        // TCP reports it as unreachable when it is fine.
        const probeMode: ProbeMode =
          entry.protocol === 'udp'
            ? 'skip'
            : projectInfo.framework?.category === 'database'
              ? 'tcp'
              : 'http';
        const health = await this.healthService.checkHealth(entry.port, probeMode);

        const service: ServiceInfo = {
          id: `${entry.protocol}-${entry.address}-${entry.port}`,
          port: entry.port,
          protocol: entry.protocol,
          address: entry.address,
          pid: entry.pid,
          processName,
          executablePath,
          commandLine,
          ppid,
          parentProcessName,
          user,
          cpu,
          memoryBytes,
          projectPath: projectInfo.projectPath,
          projectName: projectInfo.projectName,
          framework: projectInfo.framework,
          isDevProcess,
          isOrphan: orphanInfo.isOrphan,
          orphanReason: orphanInfo.reason,
          supervisor,
          devSupervisor,
          health: health.status,
          responseTimeMs: health.responseTimeMs,
          url,
          discoveredAt: Date.now()
        };

        results.push(service);
      }

      // Sort: Dev processes first, then by port ascending
      results.sort((a, b) => {
        if (a.isDevProcess && !b.isDevProcess) return -1;
        if (!a.isDevProcess && b.isDevProcess) return 1;
        return a.port - b.port;
      });

      this.cachedServices = results;
      this.emit('services-updated', this.cachedServices);
      return results;
    } catch (err: any) {
      console.error('PortService: refresh error', err.message);
      // Tell the renderer, so a broken scan is visible instead of looking like an
      // idle machine with a stale list.
      this.emit('scan-failed', err?.message || 'Port discovery failed');
      return this.cachedServices;
    } finally {
      this.isScanning = false;
    }
  }
}
