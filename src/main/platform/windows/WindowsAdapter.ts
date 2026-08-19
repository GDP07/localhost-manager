import { exec } from 'child_process';
import { promisify } from 'util';
import { shell } from 'electron';
import path from 'path';
import { PlatformAdapter, RawPortEntry, RawProcessInfo } from '../PlatformAdapter';
import { DevSupervisor, ProcessSupervisor, ProcessTreeNode } from '../../../shared/types/service';
import { ancestryOf, collectJobPids, findDevSupervisor, resolveSupervisionRoot } from '../supervision';

const execAsync = promisify(exec);

export class WindowsAdapter implements PlatformAdapter {
  readonly platform = 'win32' as const;

  async getListeningPorts(): Promise<RawPortEntry[]> {
    const ports: RawPortEntry[] = [];
    const seen = new Set<string>();

    try {
      // netstat -ano -p tcp
      const { stdout } = await execAsync('netstat -ano -p tcp', { maxBuffer: 10 * 1024 * 1024 });
      const lines = stdout.split('\r\n');

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith('TCP')) continue;

        // TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       48231
        // TCP    [::]:3000              [::]:0                 LISTENING       48231
        const parts = line.split(/\s+/);
        if (parts.length < 5) continue;

        const state = parts[3];
        if (state !== 'LISTENING') continue;

        const localAddr = parts[1];
        const pid = parseInt(parts[4], 10);
        if (isNaN(pid) || pid <= 0) continue;

        const lastColon = localAddr.lastIndexOf(':');
        if (lastColon === -1) continue;

        const address = localAddr.substring(0, lastColon).replace(/^\[|\]$/g, '') || '0.0.0.0';
        const port = parseInt(localAddr.substring(lastColon + 1), 10);
        if (isNaN(port) || port <= 0 || port > 65535) continue;

        const key = `${port}-tcp-${pid}`;
        if (!seen.has(key)) {
          seen.add(key);
          ports.push({
            port,
            protocol: 'tcp',
            address,
            pid
          });
        }
      }
    } catch (err: any) {
      console.warn('WindowsAdapter: netstat TCP error', err.message);
    }

    try {
      // netstat -ano -p udp
      const { stdout } = await execAsync('netstat -ano -p udp', { maxBuffer: 5 * 1024 * 1024 });
      const lines = stdout.split('\r\n');
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith('UDP')) continue;
        const parts = line.split(/\s+/);
        if (parts.length < 4) continue;

        const localAddr = parts[1];
        const pid = parseInt(parts[parts.length - 1], 10);
        if (isNaN(pid) || pid <= 0) continue;

        const lastColon = localAddr.lastIndexOf(':');
        if (lastColon === -1) continue;

        const address = localAddr.substring(0, lastColon).replace(/^\[|\]$/g, '') || '0.0.0.0';
        const port = parseInt(localAddr.substring(lastColon + 1), 10);
        if (isNaN(port) || port <= 0 || port > 65535) continue;

        const key = `${port}-udp-${pid}`;
        if (!seen.has(key)) {
          seen.add(key);
          ports.push({
            port,
            protocol: 'udp',
            address,
            pid
          });
        }
      }
    } catch {}

    return ports;
  }

  async getAllProcesses(): Promise<Map<number, RawProcessInfo>> {
    const processMap = new Map<number, RawProcessInfo>();

    try {
      // PowerShell Get-CimInstance Win32_Process
      const cmd = `powershell -NoProfile -Command "Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, Name, ExecutablePath, CommandLine, WorkingSetSize | ConvertTo-Json -Compress"`;
      const { stdout } = await execAsync(cmd, { maxBuffer: 30 * 1024 * 1024 });

      if (stdout.trim()) {
        let items: any[] = [];
        try {
          const parsed = JSON.parse(stdout.trim());
          items = Array.isArray(parsed) ? parsed : [parsed];
        } catch {}

        for (const item of items) {
          const pid = Number(item.ProcessId);
          if (!pid) continue;
          const ppid = Number(item.ParentProcessId) || null;
          const name = item.Name || '';
          const commandLine = item.CommandLine || name;
          const executablePath = item.ExecutablePath || '';
          const memoryBytes = Number(item.WorkingSetSize) || 0;

          processMap.set(pid, {
            pid,
            ppid,
            pgid: null, // Windows has no process groups; supervision is inferred by command.
            name,
            commandLine,
            executablePath,
            user: null,
            cpu: 0,
            memoryBytes,
            cwd: executablePath ? path.dirname(executablePath) : null,
            parentName: null
          });
        }
      }
    } catch (err: any) {
      console.warn('WindowsAdapter: getAllProcesses error', err.message);
    }

    return processMap;
  }

  async getProcessDetails(pid: number): Promise<RawProcessInfo | null> {
    try {
      const cmd = `powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \\"ProcessId = ${pid}\\" | Select-Object ProcessId, ParentProcessId, Name, ExecutablePath, CommandLine, WorkingSetSize | ConvertTo-Json"`;
      const { stdout } = await execAsync(cmd, { timeout: 3000 });
      if (!stdout.trim()) return null;

      const item = JSON.parse(stdout.trim());
      return {
        pid,
        ppid: Number(item.ParentProcessId) || null,
        pgid: null,
        name: item.Name || '',
        commandLine: item.CommandLine || item.Name || '',
        executablePath: item.ExecutablePath || '',
        user: null,
        cpu: 0,
        memoryBytes: Number(item.WorkingSetSize) || 0,
        cwd: item.ExecutablePath ? path.dirname(item.ExecutablePath) : null,
        parentName: null
      };
    } catch {
      return null;
    }
  }

  async getSupervisedProcesses(pids: number[]): Promise<Map<number, ProcessSupervisor>> {
    const supervised = new Map<number, ProcessSupervisor>();
    if (pids.length === 0) return supervised;

    try {
      // Win32_Service maps a running service to the pid hosting it.
      const cmd =
        'powershell -NoProfile -Command "Get-CimInstance Win32_Service ' +
        '| Where-Object { $_.ProcessId -gt 0 } ' +
        '| Select-Object ProcessId, Name | ConvertTo-Json -Compress"';
      const { stdout } = await execAsync(cmd, { timeout: 8000, maxBuffer: 4 * 1024 * 1024 });

      const parsed = JSON.parse(stdout.trim() || '[]');
      const rows: { ProcessId: number; Name: string }[] = Array.isArray(parsed) ? parsed : [parsed];
      const wanted = new Set(pids);

      for (const row of rows) {
        if (!row?.ProcessId || !wanted.has(row.ProcessId)) continue;
        supervised.set(row.ProcessId, {
          kind: 'windows-service',
          label: row.Name,
          stopHint: `sc stop ${row.Name}`
        });
      }
    } catch {
      // PowerShell unavailable or output unparseable; report nothing as supervised.
    }

    return supervised;
  }

  async getProcessCwds(_pids: number[]): Promise<Map<number, string>> {
    // Windows does not expose another process's working directory without injecting
    // into it. getAllProcesses already falls back to the executable's directory.
    return new Map();
  }

  async getProcessTree(rootPid: number): Promise<ProcessTreeNode | null> {
    const allProcs = await this.getAllProcesses();
    const rootProc = allProcs.get(rootPid);
    if (!rootProc) return null;

    const childrenByPpid = new Map<number, RawProcessInfo[]>();
    for (const proc of allProcs.values()) {
      if (proc.ppid) {
        const list = childrenByPpid.get(proc.ppid) || [];
        list.push(proc);
        childrenByPpid.set(proc.ppid, list);
      }
    }

    const buildNode = (proc: RawProcessInfo): ProcessTreeNode => {
      const children = (childrenByPpid.get(proc.pid) || []).map(buildNode);
      return {
        pid: proc.pid,
        ppid: proc.ppid || 0,
        name: proc.name,
        commandLine: proc.commandLine,
        cpu: proc.cpu,
        memoryBytes: proc.memoryBytes,
        children
      };
    };

    return buildNode(rootProc);
  }

  async terminateProcess(pid: number, force = false): Promise<boolean> {
    try {
      const cmd = force ? `taskkill /F /PID ${pid}` : `taskkill /PID ${pid}`;
      await execAsync(cmd);
      return true;
    } catch (err: any) {
      if (force) {
        try {
          process.kill(pid, 'SIGKILL');
          return true;
        } catch {
          return false;
        }
      }
      return false;
    }
  }

  async resolveStopTarget(pid: number): Promise<DevSupervisor | null> {
    const processes = await this.getAllProcesses();
    return findDevSupervisor(pid, processes, {
      protectedPids: ancestryOf(process.pid, processes)
    });
  }

  async terminateProcessTree(startPid: number, force = false): Promise<boolean> {
    const processes = await this.getAllProcesses();
    const { pid: rootPid } = processes.has(startPid)
      ? resolveSupervisionRoot(startPid, processes, {
          protectedPids: ancestryOf(process.pid, processes)
        })
      : { pid: startPid };

    try {
      // /T covers the descendants, so one call handles the whole job once the root is
      // right. Without the walk above this killed the child a supervisor immediately
      // replaced.
      const cmd = force ? `taskkill /F /T /PID ${rootPid}` : `taskkill /T /PID ${rootPid}`;
      await execAsync(cmd);
      return true;
    } catch {
      // taskkill refuses when the root is already gone; sweep whatever is left of the job.
      const jobPids = processes.has(rootPid) ? collectJobPids(rootPid, processes) : [rootPid];
      let allOk = true;
      for (const pid of jobPids) {
        if (!(await this.terminateProcess(pid, force))) allOk = false;
      }
      return allOk;
    }
  }

  async openTerminal(dirPath: string, customTerminal?: string): Promise<void> {
    const resolvedPath = path.resolve(dirPath);
    if (customTerminal) {
      await execAsync(`start "${customTerminal}" "${resolvedPath}"`);
      return;
    }

    try {
      // Try Windows Terminal
      await execAsync(`wt.exe -d "${resolvedPath}"`);
    } catch {
      // Fallback PowerShell
      await execAsync(`start powershell.exe -NoExit -Command "Set-Location '${resolvedPath}'"`);
    }
  }

  async openBrowser(url: string): Promise<void> {
    await shell.openExternal(url);
  }

  async showInFileManager(filePath: string): Promise<void> {
    shell.showItemInFolder(path.resolve(filePath));
  }
}
