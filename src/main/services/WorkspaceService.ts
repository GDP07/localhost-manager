import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { Workspace, WorkspaceCommand } from '../../shared/types/workspace';
import { PortConflict } from '../../shared/types/service';
import { LogService } from './LogService';
import { PlatformAdapter } from '../platform/PlatformAdapter';
import { PortService } from './PortService';

interface RunningCommandInfo {
  process: ChildProcess;
  command: WorkspaceCommand;
}

export class WorkspaceService extends EventEmitter {
  private configDir: string;
  private workspacesFile: string;
  private workspaces = new Map<string, Workspace>();
  private runningProcesses = new Map<string, RunningCommandInfo>(); // key: `${workspaceId}-${commandId}`

  constructor(
    private logService: LogService,
    private platformAdapter: PlatformAdapter,
    private portService: PortService
  ) {
    super();
    this.configDir = path.join(os.homedir(), '.localhost-manager');
    this.workspacesFile = path.join(this.configDir, 'workspaces.json');
    this.loadWorkspaces();
  }

  private loadWorkspaces(): void {
    try {
      if (!fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true });
      }
      if (fs.existsSync(this.workspacesFile)) {
        const raw = fs.readFileSync(this.workspacesFile, 'utf-8');
        const list: Workspace[] = JSON.parse(raw);
        for (const item of list) {
          // Reset runtime status on boot
          item.status = 'stopped';
          item.commands = item.commands.map((c) => ({ ...c, status: 'idle', pid: undefined }));
          this.workspaces.set(item.id, item);
        }
      }
    } catch (err) {
      console.warn('Failed to load workspaces:', err);
    }
  }

  private saveWorkspaces(): void {
    try {
      if (!fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true });
      }
      const list = Array.from(this.workspaces.values()).map((ws) => ({
        ...ws,
        status: ws.status === 'running' || ws.status === 'starting' ? ws.status : 'stopped',
        commands: ws.commands.map((c) => ({
          id: c.id,
          name: c.name,
          command: c.command,
          expectedPort: c.expectedPort,
          status: 'idle'
        }))
      }));
      fs.writeFileSync(this.workspacesFile, JSON.stringify(list, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save workspaces:', err);
    }
  }

  getWorkspaces(): Workspace[] {
    return Array.from(this.workspaces.values());
  }

  getWorkspace(id: string): Workspace | undefined {
    return this.workspaces.get(id);
  }

  saveWorkspace(data: Partial<Workspace> & { name: string; directory: string }): Workspace {
    const id = data.id || `ws-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const existing = this.workspaces.get(id);

    const workspace: Workspace = {
      id,
      name: data.name.trim(),
      directory: data.directory.trim(),
      commands: (data.commands || []).map((cmd, idx) => ({
        id: cmd.id || `cmd-${idx}-${Date.now()}`,
        name: cmd.name || `Command ${idx + 1}`,
        command: cmd.command,
        expectedPort: cmd.expectedPort,
        status: 'idle'
      })),
      url: data.url?.trim(),
      healthCheck: data.healthCheck?.trim(),
      env: data.env || {},
      status: existing?.status || 'stopped',
      createdAt: existing?.createdAt || Date.now(),
      updatedAt: Date.now()
    };

    this.workspaces.set(id, workspace);
    this.saveWorkspaces();
    this.emit('workspace-updated', workspace);
    return workspace;
  }

  deleteWorkspace(id: string): boolean {
    this.stopWorkspace(id);
    const deleted = this.workspaces.delete(id);
    if (deleted) {
      this.saveWorkspaces();
      this.emit('workspace-deleted', id);
    }
    return deleted;
  }

  async checkPortConflicts(expectedPorts: number[]): Promise<PortConflict[]> {
    const currentServices = this.portService.getServices();
    const conflicts: PortConflict[] = [];

    for (const port of expectedPorts) {
      const match = currentServices.find((s) => s.port === port);
      if (match) {
        conflicts.push({
          port,
          currentPid: match.pid,
          processName: match.processName,
          projectName: match.projectName,
          commandLine: match.commandLine
        });
      }
    }

    return conflicts;
  }

  async startWorkspace(id: string, bypassConflictCheck = false): Promise<{ success: boolean; error?: string; conflicts?: PortConflict[] }> {
    const ws = this.workspaces.get(id);
    if (!ws) return { success: false, error: 'Workspace not found' };

    if (ws.status === 'running' || ws.status === 'starting') {
      return { success: true };
    }

    // Check port conflicts
    if (!bypassConflictCheck) {
      const expectedPorts = ws.commands.map((c) => c.expectedPort).filter((p): p is number => typeof p === 'number' && p > 0);
      if (expectedPorts.length > 0) {
        const conflicts = await this.checkPortConflicts(expectedPorts);
        if (conflicts.length > 0) {
          return { success: false, error: 'Port conflict detected', conflicts };
        }
      }
    }

    ws.status = 'starting';
    this.emit('workspace-updated', ws);

    this.logService.appendLog(ws.id, 'system', 'Workspace', 'system', `Starting ${ws.name} in ${ws.directory}`);

    const isWindows = process.platform === 'win32';
    let anySuccess = false;

    for (const cmd of ws.commands) {
      cmd.status = 'starting';
      this.emit('workspace-updated', ws);

      try {
        const env = { ...process.env, ...(ws.env || {}) };
        const shellCmd = isWindows ? 'cmd.exe' : '/bin/sh';
        const shellArgs = isWindows ? ['/c', cmd.command] : ['-c', cmd.command];

        const child = spawn(shellCmd, shellArgs, {
          cwd: ws.directory,
          env,
          detached: !isWindows, // create new process group
          stdio: ['ignore', 'pipe', 'pipe']
        });

        if (child.pid) {
          cmd.pid = child.pid;
          cmd.status = 'running';
          anySuccess = true;

          const key = `${ws.id}-${cmd.id}`;
          this.runningProcesses.set(key, { process: child, command: cmd });

          this.logService.appendLog(ws.id, cmd.id, cmd.name, 'system', `started as pid ${child.pid}: ${cmd.command}`);

          child.stdout?.on('data', (chunk: Buffer) => {
            const lines = chunk.toString('utf-8').split('\n');
            for (const line of lines) {
              if (line.trim()) {
                this.logService.appendLog(ws.id, cmd.id, cmd.name, 'stdout', line);
              }
            }
          });

          child.stderr?.on('data', (chunk: Buffer) => {
            const lines = chunk.toString('utf-8').split('\n');
            for (const line of lines) {
              if (line.trim()) {
                this.logService.appendLog(ws.id, cmd.id, cmd.name, 'stderr', line);
              }
            }
          });

          child.on('close', (code) => {
            cmd.status = code === 0 ? 'stopped' : 'failed';
            cmd.exitCode = code;
            this.runningProcesses.delete(key);
            this.logService.appendLog(ws.id, cmd.id, cmd.name, 'system', `exited with code ${code}`);
            this.checkWorkspaceOverallStatus(ws);
          });

          child.on('error', (err) => {
            cmd.status = 'failed';
            this.logService.appendLog(ws.id, cmd.id, cmd.name, 'stderr', `could not spawn: ${err.message}`);
            this.checkWorkspaceOverallStatus(ws);
          });
        }
      } catch (err: any) {
        cmd.status = 'failed';
        this.logService.appendLog(ws.id, cmd.id, cmd.name, 'stderr', `error: ${err.message}`);
      }
    }

    ws.status = anySuccess ? 'running' : 'failed';
    this.emit('workspace-updated', ws);

    // Trigger port refresh so new ports appear immediately
    setTimeout(() => this.portService.refreshServices(), 1000);
    setTimeout(() => this.portService.refreshServices(), 3000);

    return { success: anySuccess };
  }

  private checkWorkspaceOverallStatus(ws: Workspace): void {
    const hasRunning = ws.commands.some((c) => c.status === 'running' || c.status === 'starting');
    const hasFailed = ws.commands.some((c) => c.status === 'failed');

    if (hasRunning) {
      ws.status = 'running';
    } else if (hasFailed) {
      ws.status = 'failed';
    } else {
      ws.status = 'stopped';
    }
    this.emit('workspace-updated', ws);
  }

  async stopWorkspace(id: string): Promise<{ success: boolean; error?: string }> {
    const ws = this.workspaces.get(id);
    if (!ws) return { success: false, error: 'Workspace not found' };

    this.logService.appendLog(ws.id, 'system', 'Workspace', 'system', `Stopping ${ws.name}`);

    for (const cmd of ws.commands) {
      const key = `${ws.id}-${cmd.id}`;
      const running = this.runningProcesses.get(key);

      if (running && running.process.pid) {
        try {
          await this.platformAdapter.terminateProcessTree(running.process.pid, false);
        } catch {
          try {
            running.process.kill('SIGKILL');
          } catch {}
        }
        this.runningProcesses.delete(key);
      }

      cmd.status = 'stopped';
      cmd.pid = undefined;
    }

    ws.status = 'stopped';
    this.emit('workspace-updated', ws);
    setTimeout(() => this.portService.refreshServices(), 1000);

    return { success: true };
  }

  async restartWorkspace(id: string): Promise<{ success: boolean; error?: string }> {
    await this.stopWorkspace(id);
    await new Promise((r) => setTimeout(r, 1000));
    return this.startWorkspace(id, true);
  }
}
