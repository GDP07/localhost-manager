import { EventEmitter } from 'events';
import { WorkspaceExecutionLog } from '../../shared/types/workspace';

export class LogService extends EventEmitter {
  private logs = new Map<string, WorkspaceExecutionLog[]>();
  private readonly MAX_LOGS_PER_WORKSPACE = 1000;

  appendLog(
    workspaceId: string,
    commandId: string,
    commandName: string,
    type: 'stdout' | 'stderr' | 'system',
    message: string
  ): WorkspaceExecutionLog {
    const entry: WorkspaceExecutionLog = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      workspaceId,
      commandId,
      commandName,
      timestamp: Date.now(),
      type,
      message
    };

    const currentList = this.logs.get(workspaceId) || [];
    currentList.push(entry);
    if (currentList.length > this.MAX_LOGS_PER_WORKSPACE) {
      currentList.shift();
    }
    this.logs.set(workspaceId, currentList);

    this.emit('new-log', entry);
    return entry;
  }

  getLogs(workspaceId: string): WorkspaceExecutionLog[] {
    return this.logs.get(workspaceId) || [];
  }

  clearLogs(workspaceId: string): void {
    this.logs.set(workspaceId, []);
    this.emit('logs-cleared', workspaceId);
  }
}
