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

export class LinuxAdapter implements PlatformAdapter {
  readonly platform = 'linux' as const;

  async getListeningPorts(): Promise<RawPortEntry[]> {
    const ports: RawPortEntry[] = [];
    const seen = new Set<string>();

    // Strategy 1: ss -tulpn
    try {
      const { stdout } = await execAsync('ss -tulpn', { maxBuffer: 10 * 1024 * 1024 });
      const lines = stdout.split('\n');

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Netid State Recv-Q Send-Q Local Address:Port Peer Address:Port Process
        // tcp   LISTEN 0     128    0.0.0.0:3000       0.0.0.0:*         users:(("node",pid=48231,fd=23))
        const parts = line.split(/\s+/);
        if (parts.length < 5) continue;

        const proto = parts[0].toLowerCase().includes('tcp') ? 'tcp' : 'udp';
        const localAddrField = parts[4];

        const lastColon = localAddrField.lastIndexOf(':');
        if (lastColon === -1) continue;

        const address = localAddrField.substring(0, lastColon).replace(/^\[|\]$/g, '') || '0.0.0.0';
        const port = parseInt(localAddrField.substring(lastColon + 1), 10);
        if (isNaN(port) || port <= 0 || port > 65535) continue;

        // Extract pid from users:(("node",pid=48231,fd=23))
        let pid = 0;
        let processNameHint: string | undefined;

        if (parts[6]) {
          const pidMatch = parts[6].match(/pid=(\d+)/);
          if (pidMatch) pid = parseInt(pidMatch[1], 10);

          const nameMatch = parts[6].match(/"([^"]+)"/);
          if (nameMatch) processNameHint = nameMatch[1];
        }

        if (pid > 0) {
          const key = `${port}-${proto}-${pid}`;
          if (!seen.has(key)) {
            seen.add(key);
            ports.push({
              port,
              protocol: proto as 'tcp' | 'udp',
              address: address === '*' ? '0.0.0.0' : address,
              pid,
              processNameHint
            });
          }
        }
      }
    } catch {
      // Fallback: lsof -nP -iTCP -sTCP:LISTEN
      try {
        const { stdout } = await execAsync('lsof -nP -iTCP -sTCP:LISTEN', { maxBuffer: 10 * 1024 * 1024 });
        const lines = stdout.split('\n');
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) continue;
          const parts = line.split(/\s+/);
          if (parts.length < 9) continue;

          const pid = parseInt(parts[1], 10);
          if (isNaN(pid) || pid <= 0) continue;

          const nameField = parts[8];
          const lastColon = nameField.lastIndexOf(':');
          if (lastColon === -1) continue;

          const address = nameField.substring(0, lastColon).replace(/^\[|\]$/g, '') || '0.0.0.0';
          const port = parseInt(nameField.substring(lastColon + 1), 10);
          if (isNaN(port) || port <= 0 || port > 65535) continue;

          const key = `${port}-tcp-${pid}`;
          if (!seen.has(key)) {
            seen.add(key);
            ports.push({
              port,
              protocol: 'tcp',
              address: address === '*' ? '0.0.0.0' : address,
              pid,
              processNameHint: parts[0]
            });
          }
        }
      } catch {}
    }

    return ports;
  }

  async getAllProcesses(): Promise<Map<number, RawProcessInfo>> {
    const processMap = new Map<number, RawProcessInfo>();

    try {
      // ps -eo pid,ppid,pgid,user,%cpu,rss,comm,args
      const { stdout } = await execAsync('ps -eo pid,ppid,pgid,user,%cpu,rss,comm,args', { maxBuffer: 20 * 1024 * 1024 });
      const lines = stdout.split('\n');

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const match = line.match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+([\d.]+)\s+(\d+)\s+(\S+)\s+(.*)$/);
        if (!match) continue;

        const pid = parseInt(match[1], 10);
        const ppid = parseInt(match[2], 10);
        const pgid = parseInt(match[3], 10);
        const user = match[4];
        const cpu = parseFloat(match[5]) || 0;
        const rssKb = parseInt(match[6], 10) || 0;
        const comm = match[7];
        const args = match[8];

        processMap.set(pid, {
          pid,
          ppid: ppid > 0 ? ppid : null,
          pgid: pgid > 0 ? pgid : null,
          name: path.basename(comm),
          commandLine: args || comm,
          executablePath: comm,
          user,
          cpu,
          memoryBytes: rssKb * 1024,
          cwd: null,
          parentName: null
        });
      }

      for (const proc of processMap.values()) {
        if (proc.ppid && processMap.has(proc.ppid)) {
          proc.parentName = processMap.get(proc.ppid)!.name;
        }
      }
    } catch (err: any) {
      console.warn('LinuxAdapter: getAllProcesses error', err.message);
    }

    return processMap;
  }

  async getProcessDetails(pid: number): Promise<RawProcessInfo | null> {
    try {
      const { stdout } = await execAsync(`ps -p ${pid} -o pid,ppid,pgid,user,%cpu,rss,comm,args`, { maxBuffer: 1024 * 1024 });
      const lines = stdout.trim().split('\n');
      if (lines.length < 2) return null;

      const line = lines[1].trim();
      const match = line.match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+([\d.]+)\s+(\d+)\s+(\S+)\s+(.*)$/);
      if (!match) return null;

      const ppid = parseInt(match[2], 10);
      const pgid = parseInt(match[3], 10);
      const user = match[4];
      const cpu = parseFloat(match[5]) || 0;
      const rssKb = parseInt(match[6], 10) || 0;
      const comm = match[7];
      const args = match[8];

      let parentName: string | null = null;
      if (ppid > 0) {
        try {
          const { stdout: pstdout } = await execAsync(`ps -p ${ppid} -o comm=`);
          parentName = path.basename(pstdout.trim());
        } catch {}
      }

      let cwd: string | null = null;
      try {
        const cwdLink = `/proc/${pid}/cwd`;
        if (fs.existsSync(cwdLink)) {
          cwd = fs.readlinkSync(cwdLink);
        }
      } catch {}

      return {
        pid,
        ppid: ppid > 0 ? ppid : null,
        pgid: pgid > 0 ? pgid : null,
        name: path.basename(comm),
        commandLine: args || comm,
        executablePath: comm,
        user,
        cpu,
        memoryBytes: rssKb * 1024,
        cwd,
        parentName
      };
    } catch {
      return null;
    }
  }

  async getProcessCwds(pids: number[]): Promise<Map<number, string>> {
    const cwds = new Map<number, string>();

    for (const pid of new Set(pids)) {
      try {
        const cwd = fs.readlinkSync(`/proc/${pid}/cwd`);
        // "/" means no meaningful working directory (daemons, systemd units).
        if (cwd && cwd !== '/') cwds.set(pid, cwd);
      } catch {
        // Process exited, or belongs to another user.
      }
    }

    return cwds;
  }

  async getSupervisedProcesses(pids: number[]): Promise<Map<number, ProcessSupervisor>> {
    const supervised = new Map<number, ProcessSupervisor>();

    for (const pid of new Set(pids)) {
      try {
        // A systemd-managed process names its unit in its cgroup path, e.g.
        // "0::/system.slice/redis-server.service" or a user@.service slice.
        const cgroup = fs.readFileSync(`/proc/${pid}/cgroup`, 'utf-8');
        const unit = cgroup.match(/([\w@\\.-]+\.service)/);
        if (!unit) continue;

        const label = unit[1];
        const userScoped = cgroup.includes('user.slice') || cgroup.includes('user@');
        supervised.set(pid, {
          kind: 'systemd',
          label,
          // Only offer a command for units in the user's own slice. Suggesting how to
          // stop a system unit invites breaking the machine.
          stopHint: userScoped ? `systemctl --user stop ${label}` : undefined
        });
      } catch {
        // No procfs entry, or not readable.
      }
    }

    return supervised;
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
      await execAsync(`${customTerminal} --working-directory="${resolvedPath}"`);
      return;
    }

    const terminals = ['gnome-terminal', 'konsole', 'alacritty', 'kitty', 'x-terminal-emulator', 'xterm'];
    for (const term of terminals) {
      try {
        if (term === 'gnome-terminal') {
          await execAsync(`gnome-terminal --working-directory="${resolvedPath}"`);
          return;
        } else if (term === 'alacritty' || term === 'kitty') {
          await execAsync(`${term} --working-directory "${resolvedPath}"`);
          return;
        } else {
          await execAsync(`${term} -e "cd '${resolvedPath}' && bash"`);
          return;
        }
      } catch {}
    }

    // fallback
    await shell.openPath(resolvedPath);
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
