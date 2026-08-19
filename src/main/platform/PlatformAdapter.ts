import { DevSupervisor, ProcessSupervisor, ProcessTreeNode } from '../../shared/types/service';

export interface RawPortEntry {
  port: number;
  protocol: 'tcp' | 'udp';
  address: string;
  pid: number;
  processNameHint?: string;
}

export interface RawProcessInfo {
  pid: number;
  ppid: number | null;
  /**
   * POSIX process group id: the identity of the *job*, which is what a stop has to
   * target. Null on Windows, which has no equivalent.
   */
  pgid: number | null;
  name: string;
  commandLine: string;
  executablePath: string;
  user: string | null;
  cpu: number;
  memoryBytes: number;
  cwd: string | null;
  parentName: string | null;
}

export interface PlatformAdapter {
  readonly platform: 'darwin' | 'win32' | 'linux';
  getListeningPorts(): Promise<RawPortEntry[]>;
  getProcessDetails(pid: number): Promise<RawProcessInfo | null>;
  getAllProcesses(): Promise<Map<number, RawProcessInfo>>;
  /**
   * Working directories for the given pids, in one call. Resolved separately from
   * getAllProcesses because it is far more expensive than reading the process table,
   * so only the processes actually holding a port are looked up.
   */
  getProcessCwds(pids: number[]): Promise<Map<number, string>>;
  /**
   * Which of the given pids are supervised jobs rather than plain processes.
   * Used to keep managed services from being reported as orphans.
   */
  getSupervisedProcesses(pids: number[]): Promise<Map<number, ProcessSupervisor>>;
  getProcessTree(pid: number): Promise<ProcessTreeNode | null>;
  /**
   * The pid a stop should actually target: the top of the job owning `pid`, which
   * differs from `pid` whenever a supervisor would respawn it.
   */
  resolveStopTarget(pid: number): Promise<DevSupervisor | null>;
  terminateProcess(pid: number, force?: boolean): Promise<boolean>;
  terminateProcessTree(pid: number, force?: boolean): Promise<boolean>;
  openTerminal(dirPath: string, customTerminal?: string): Promise<void>;
  openBrowser(url: string): Promise<void>;
  showInFileManager(filePath: string): Promise<void>;
}
