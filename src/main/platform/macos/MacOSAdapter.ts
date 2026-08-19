import { exec } from 'child_process';
import { promisify } from 'util';
import { shell } from 'electron';
import fs from 'fs';
import path from 'path';
import { PlatformAdapter, RawPortEntry, RawProcessInfo } from '../PlatformAdapter';
import { DevSupervisor, ProcessSupervisor, ProcessTreeNode } from '../../../shared/types/service';
import { ancestryOf, findDevSupervisor } from '../supervision';
import { terminateJob, terminatePid } from '../posixTermination';

const execAsync = promisify(exec);

export class MacOSAdapter implements PlatformAdapter {
  readonly platform = 'darwin' as const;

  async getListeningPorts(): Promise<RawPortEntry[]> {
    const ports: RawPortEntry[] = [];
    const seen = new Set<string>();

    try {
      // lsof -nP -iTCP -sTCP:LISTEN
      const { stdout } = await execAsync('lsof -nP -iTCP -sTCP:LISTEN', { maxBuffer: 10 * 1024 * 1024 });
      const lines = stdout.split('\n');

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Typical line:
        // COMMAND   PID USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME
        // node    48231 user   23u  IPv4 0x...       0t0  TCP *:3000 (LISTEN)
        // Python  81290 user    4u  IPv6 0x...       0t0  TCP [::1]:8000 (LISTEN)
        const parts = line.split(/\s+/);
        if (parts.length < 9) continue;

        const processNameHint = parts[0];
        const pid = parseInt(parts[1], 10);
        if (isNaN(pid) || pid <= 0) continue;

        const nameField = parts[8]; // e.g. *:3000 or 127.0.0.1:5173 or [::1]:8080
        if (nameField.includes('->')) continue;

        const lastColon = nameField.lastIndexOf(':');
        if (lastColon === -1) continue;

        const address = nameField.substring(0, lastColon).replace(/^\[|\]$/g, '') || '0.0.0.0';
        const portStr = nameField.substring(lastColon + 1);
        const port = parseInt(portStr, 10);
        if (isNaN(port) || port <= 0 || port > 65535) continue;

        const key = `${port}-tcp-${pid}`;
        if (!seen.has(key)) {
          seen.add(key);
          ports.push({
            port,
            protocol: 'tcp',
            address: address === '*' ? '0.0.0.0' : address,
            pid,
            processNameHint
          });
        }
      }
    } catch (err: any) {
      // lsof returns exit code 1 if no matching processes found
      if (err.code !== 1) {
        console.warn('MacOSAdapter: lsof error for TCP', err.message);
      }
    }

    try {
      // Also discover listening UDP if any
      const { stdout: udpStdout } = await execAsync('lsof -nP -iUDP', { maxBuffer: 5 * 1024 * 1024 });
      const udpLines = udpStdout.split('\n');
      for (let i = 1; i < udpLines.length; i++) {
        const line = udpLines[i].trim();
        if (!line) continue;
        const parts = line.split(/\s+/);
        if (parts.length < 9) continue;

        const pid = parseInt(parts[1], 10);
        if (isNaN(pid) || pid <= 0) continue;

        const nameField = parts[8];
        // "local->peer" is an established connection, not a bound listener.
        if (nameField.includes('->')) continue;

        const lastColon = nameField.lastIndexOf(':');
        if (lastColon === -1) continue;

        const address = nameField.substring(0, lastColon).replace(/^\[|\]$/g, '') || '0.0.0.0';
        const port = parseInt(nameField.substring(lastColon + 1), 10);
        if (isNaN(port) || port <= 0 || port > 65535) continue;

        const key = `${port}-udp-${pid}`;
        if (!seen.has(key)) {
          seen.add(key);
          ports.push({
            port,
            protocol: 'udp',
            address: address === '*' ? '0.0.0.0' : address,
            pid,
            processNameHint: parts[0]
          });
        }
      }
    } catch {
      // ignore empty UDP
    }

    return ports;
  }

  async getAllProcesses(): Promise<Map<number, RawProcessInfo>> {
    const processMap = new Map<number, RawProcessInfo>();

    try {
      // Two calls, each with exactly one space-bearing field in final position.
      // `ps` pads and truncates any column that is not last, so asking for
      // `comm,args` together silently clipped paths like
      // "/Applications/Google Chrome.app/..." down to "/Applications/Go".
      const [commResult, argsResult] = await Promise.all([
        execAsync('ps -Ax -o pid=,ppid=,pgid=,user=,%cpu=,rss=,comm=', { maxBuffer: 20 * 1024 * 1024 }),
        execAsync('ps -Ax -o pid=,args=', { maxBuffer: 20 * 1024 * 1024 })
      ]);

      const argsByPid = new Map<number, string>();
      for (const line of argsResult.stdout.split('\n')) {
        const match = line.match(/^\s*(\d+)\s+(.*)$/);
        if (match) argsByPid.set(parseInt(match[1], 10), match[2].trim());
      }

      for (const line of commResult.stdout.split('\n')) {
        // Six fixed-shape fields, then the executable path as the remainder.
        const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+([\d.]+)\s+(\d+)\s+(.*)$/);
        if (!match) continue;

        const pid = parseInt(match[1], 10);
        if (!pid || pid <= 0) continue;

        const ppid = parseInt(match[2], 10);
        const pgid = parseInt(match[3], 10);
        const executablePath = match[7].trim();

        processMap.set(pid, {
          pid,
          ppid: ppid > 0 ? ppid : null,
          pgid: pgid > 0 ? pgid : null,
          name: path.basename(executablePath) || executablePath,
          commandLine: argsByPid.get(pid) || executablePath,
          executablePath,
          user: match[4],
          cpu: parseFloat(match[5]) || 0,
          memoryBytes: (parseInt(match[6], 10) || 0) * 1024,
          cwd: null, // resolved by getProcessCwds only for pids holding a port
          parentName: null
        });
      }

      for (const proc of processMap.values()) {
        if (proc.ppid) {
          proc.parentName = processMap.get(proc.ppid)?.name ?? null;
        }
      }
    } catch (err: any) {
      console.warn('MacOSAdapter: getAllProcesses error', err.message);
    }

    return processMap;
  }

  async getProcessCwds(pids: number[]): Promise<Map<number, string>> {
    const cwds = new Map<number, string>();
    if (pids.length === 0) return cwds;

    try {
      // One lsof call for every pid; -Fpn emits `p<pid>` then `n<path>` records.
      const list = Array.from(new Set(pids)).join(',');
      const { stdout } = await execAsync(`lsof -a -p ${list} -d cwd -Fpn`, {
        timeout: 4000,
        maxBuffer: 4 * 1024 * 1024
      });

      let current: number | null = null;
      for (const line of stdout.split('\n')) {
        if (line.startsWith('p')) {
          current = parseInt(line.slice(1), 10) || null;
        } else if (line.startsWith('n') && current !== null) {
          const cwd = line.slice(1).trim();
          // "/" means the process was started without a meaningful working
          // directory (launchd, app bundles) — not a project, so skip it.
          if (cwd && cwd !== '/') cwds.set(current, cwd);
        }
      }
    } catch {
      // lsof exits non-zero when it cannot inspect a pid; partial results are fine.
    }

    return cwds;
  }

  async getProcessDetails(pid: number): Promise<RawProcessInfo | null> {
    try {
      const [commResult, argsResult] = await Promise.all([
        execAsync(`ps -p ${pid} -o ppid=,pgid=,user=,%cpu=,rss=,comm=`, { maxBuffer: 1024 * 1024 }),
        execAsync(`ps -p ${pid} -o args=`, { maxBuffer: 1024 * 1024 })
      ]);

      const match = commResult.stdout
        .trim()
        .match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+([\d.]+)\s+(\d+)\s+(.*)$/);
      if (!match) return null;

      const ppid = parseInt(match[1], 10);
      const pgid = parseInt(match[2], 10);
      const executablePath = match[6].trim();

      let parentName: string | null = null;
      if (ppid > 0) {
        try {
          const { stdout } = await execAsync(`ps -p ${ppid} -o comm=`);
          parentName = path.basename(stdout.trim());
        } catch {
          // Parent already reaped; leave it unknown.
        }
      }

      return {
        pid,
        ppid: ppid > 0 ? ppid : null,
        pgid: pgid > 0 ? pgid : null,
        name: path.basename(executablePath) || executablePath,
        commandLine: argsResult.stdout.trim() || executablePath,
        executablePath,
        user: match[3],
        cpu: parseFloat(match[4]) || 0,
        memoryBytes: (parseInt(match[5], 10) || 0) * 1024,
        cwd: await this.getProcessCwd(pid),
        parentName
      };
    } catch {
      return null;
    }
  }

  async getProcessCwd(pid: number): Promise<string | null> {
    try {
      // lsof -a -p <pid> -d cwd -Fn
      const { stdout } = await execAsync(`lsof -a -p ${pid} -d cwd -Fn`, { timeout: 1500 });
      const lines = stdout.trim().split('\n');
      for (const line of lines) {
        if (line.startsWith('n/')) {
          const cwd = line.substring(1).trim();
          if (fs.existsSync(cwd)) return cwd;
        }
      }
    } catch {}

    // Fallback: check /proc on mac (or pwdx if available)
    try {
      const { stdout } = await execAsync(`pwdx ${pid}`, { timeout: 1000 });
      const colon = stdout.indexOf(':');
      if (colon !== -1) {
        const cwd = stdout.substring(colon + 1).trim();
        if (fs.existsSync(cwd)) return cwd;
      }
    } catch {}

    return null;
  }

  async getSupervisedProcesses(pids: number[]): Promise<Map<number, ProcessSupervisor>> {
    const supervised = new Map<number, ProcessSupervisor>();
    if (pids.length === 0) return supervised;

    const wanted = new Set(pids);

    try {
      // One call lists every launchd job in this user's domain as "PID\tStatus\tLabel".
      // Jobs with no running process print "-" in the PID column.
      const { stdout } = await execAsync('launchctl list', { timeout: 4000, maxBuffer: 4 * 1024 * 1024 });

      for (const line of stdout.split('\n')) {
        const [pidField, , label] = line.split('\t');
        const pid = parseInt(pidField, 10);
        if (!pid || !wanted.has(pid) || !label) continue;

        supervised.set(pid, {
          kind: 'launchd',
          label: label.trim(),
          stopHint: MacOSAdapter.stopHintForLabel(label.trim())
        });
      }
    } catch {
      // launchctl unavailable: fall back to treating nothing as supervised.
    }

    return supervised;
  }

  /**
   * Homebrew owns the overwhelming majority of developer-facing launchd agents, and
   * `brew services stop` is what actually unloads them.
   *
   * Apple's own jobs deliberately get no hint: `com.apple.controlcenter` and friends are
   * part of the operating system, and printing a bootout command next to them would be
   * inviting the user to break their machine.
   */
  private static stopHintForLabel(label: string): string | undefined {
    const brew = label.match(/^homebrew\.mxcl\.(.+)$/);
    if (brew) return `brew services stop ${brew[1]}`;
    if (label.startsWith('com.apple.')) return undefined;
    return `launchctl bootout gui/$(id -u)/${label}`;
  }

  async getProcessTree(rootPid: number): Promise<ProcessTreeNode | null> {
    const allProcs = await this.getAllProcesses();
    const rootProc = allProcs.get(rootPid);
    if (!rootProc) return null;

    // Group children by ppid
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

  async resolveStopTarget(pid: number): Promise<DevSupervisor | null> {
    const processes = await this.getAllProcesses();
    return findDevSupervisor(pid, processes, {
      protectedPids: ancestryOf(process.pid, processes)
    });
  }

  async terminateProcess(pid: number, force = false): Promise<boolean> {
    return terminatePid(pid, force);
  }

  async terminateProcessTree(rootPid: number, force = false): Promise<boolean> {
    const processes = await this.getAllProcesses();
    // Nothing in the table to walk: signal the pid directly rather than giving up.
    if (!processes.has(rootPid)) return terminatePid(rootPid, force);
    return terminateJob(rootPid, force, processes);
  }

  async openTerminal(dirPath: string, customTerminal?: string): Promise<void> {
    const resolvedPath = path.resolve(dirPath);

    if (customTerminal) {
      try {
        await execAsync(`open -a "${customTerminal}" "${resolvedPath}"`);
        return;
      } catch {}
    }

    // Try Warp, iTerm, then default Terminal
    const warpApp = '/Applications/Warp.app';
    const itermApp = '/Applications/iTerm.app';

    if (fs.existsSync(warpApp)) {
      try {
        await execAsync(`open -a Warp "${resolvedPath}"`);
        return;
      } catch {}
    }

    if (fs.existsSync(itermApp)) {
      try {
        await execAsync(`open -a iTerm "${resolvedPath}"`);
        return;
      } catch {}
    }

    // Default Terminal.app
    await execAsync(`open -a Terminal "${resolvedPath}"`);
  }

  async openBrowser(url: string): Promise<void> {
    await shell.openExternal(url);
  }

  async showInFileManager(filePath: string): Promise<void> {
    if (fs.existsSync(filePath)) {
      shell.showItemInFolder(filePath);
    } else {
      shell.openPath(filePath);
    }
  }
}
