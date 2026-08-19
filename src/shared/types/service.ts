export type Protocol = 'tcp' | 'udp';

export type HealthStatus = 'healthy' | 'starting' | 'unreachable' | 'unknown';

export type FrameworkCategory = 'frontend' | 'backend' | 'fullstack' | 'database' | 'tool' | 'other';

export interface FrameworkInfo {
  name: string;
  category: FrameworkCategory;
  packageManager: 'npm' | 'yarn' | 'pnpm' | 'bun' | 'pip' | 'composer' | 'cargo' | 'go' | 'system' | null;
  version?: string | null;
  icon?: string;
}

/**
 * A process started and kept alive by the operating system's service manager.
 * Distinguishing these from orphans matters: launchd/systemd being the parent is
 * normal for a supervised service, and stopping one only makes it respawn.
 */
export interface ProcessSupervisor {
  kind: 'launchd' | 'systemd' | 'windows-service';
  /** The registered job name, e.g. "homebrew.mxcl.redis". */
  label: string;
  /** The command that actually stops it for good, when we can infer one. */
  stopHint?: string;
}

/**
 * The parent that started the port holder and is still waiting on it — `php artisan
 * serve`, `nodemon`, `npm run dev`. Unlike ProcessSupervisor this is not an OS service
 * manager, just an ordinary process. Stopping the child alone always leaves this one
 * behind, and where it is a watcher it starts a replacement immediately, so a stop has
 * to target it instead.
 */
export interface DevSupervisor {
  pid: number;
  name: string;
  commandLine: string;
}

export interface ServiceInfo {
  /** Stable across process restarts: identifies the listening socket, not the process. */
  id: string; // e.g. "tcp-127.0.0.1-3000"
  port: number;
  protocol: Protocol;
  address: string; // e.g. "127.0.0.1", "0.0.0.0", "::", "::1"
  pid: number;
  processName: string;
  executablePath: string;
  commandLine: string;
  ppid: number | null;
  parentProcessName: string | null;
  user: string | null;
  cpu: number; // percentage, e.g. 2.4
  memoryBytes: number; // in bytes
  projectPath: string | null;
  projectName: string | null;
  framework: FrameworkInfo | null;
  isDevProcess: boolean;
  isOrphan: boolean;
  orphanReason?: string | null;
  supervisor: ProcessSupervisor | null;
  /** Set when the listed pid would be respawned by a parent, so Stop targets that parent. */
  devSupervisor: DevSupervisor | null;
  health: HealthStatus;
  responseTimeMs: number | null;
  url: string;
  discoveredAt: number;
}

export interface ProcessTreeNode {
  pid: number;
  ppid: number;
  name: string;
  commandLine: string;
  cpu: number;
  memoryBytes: number;
  children: ProcessTreeNode[];
}

export interface PortConflict {
  port: number;
  currentPid: number;
  processName: string;
  projectName?: string | null;
  commandLine?: string;
}
