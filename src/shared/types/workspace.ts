export interface WorkspaceCommand {
  id: string;
  name: string;
  command: string;
  expectedPort?: number;
  status: 'idle' | 'starting' | 'running' | 'failed' | 'stopped';
  pid?: number;
  exitCode?: number | null;
}

export interface Workspace {
  id: string;
  name: string;
  directory: string;
  commands: WorkspaceCommand[];
  url?: string;
  healthCheck?: string;
  env?: Record<string, string>;
  status: 'stopped' | 'starting' | 'running' | 'failed';
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceExecutionLog {
  id: string;
  workspaceId: string;
  commandId: string;
  commandName: string;
  timestamp: number;
  type: 'stdout' | 'stderr' | 'system';
  message: string;
}
