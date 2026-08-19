import { contextBridge, ipcRenderer, clipboard } from 'electron';
import os from 'os';
import { ServiceInfo, ProcessTreeNode, PortConflict } from '../shared/types/service';
import { Workspace, WorkspaceExecutionLog } from '../shared/types/workspace';
import { AppConfig } from '../shared/types/config';
import { StopAllDevResult, FirstRunSummary } from '../shared/types/ipc';

export const localhostManagerAPI = {
  // Services
  getServices: (): Promise<ServiceInfo[]> => ipcRenderer.invoke('get-services'),
  refreshServices: (): Promise<ServiceInfo[]> => ipcRenderer.invoke('refresh-services'),
  getProcessTree: (pid: number): Promise<ProcessTreeNode | null> => ipcRenderer.invoke('get-process-tree', pid),
  stopProcess: (pid: number, force = false): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('stop-process', { pid, force }),
  stopProcessTree: (pid: number, force = false): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('stop-process-tree', { pid, force }),
  stopAllDevProcesses: (): Promise<StopAllDevResult> => ipcRenderer.invoke('stop-all-dev-processes'),

  // Tools & Navigation
  openInBrowser: (url: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('open-in-browser', url),
  openInTerminal: (dirPath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('open-in-terminal', dirPath),
  showItemInFolder: (filePath: string): Promise<boolean> =>
    ipcRenderer.invoke('show-item-in-folder', filePath),
  selectDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke('select-directory'),
  copyToClipboard: (text: string): void => clipboard.writeText(text),

  // Renderer has no `os` access; needed to render paths as ~/... instead of absolute.
  homeDir: os.homedir(),

  // Workspaces
  getWorkspaces: (): Promise<Workspace[]> => ipcRenderer.invoke('get-workspaces'),
  saveWorkspace: (workspace: Partial<Workspace> & { name: string; directory: string }): Promise<Workspace> =>
    ipcRenderer.invoke('save-workspace', workspace),
  deleteWorkspace: (id: string): Promise<boolean> => ipcRenderer.invoke('delete-workspace', id),
  startWorkspace: (id: string, bypassConflictCheck = false): Promise<{ success: boolean; error?: string; conflicts?: PortConflict[] }> =>
    ipcRenderer.invoke('start-workspace', { id, bypassConflictCheck }),
  stopWorkspace: (id: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('stop-workspace', id),
  restartWorkspace: (id: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('restart-workspace', id),
  getWorkspaceLogs: (workspaceId: string): Promise<WorkspaceExecutionLog[]> =>
    ipcRenderer.invoke('get-workspace-logs', workspaceId),
  clearWorkspaceLogs: (workspaceId: string): Promise<boolean> =>
    ipcRenderer.invoke('clear-workspace-logs', workspaceId),
  checkPortConflicts: (ports: number[]): Promise<PortConflict[]> =>
    ipcRenderer.invoke('check-port-conflicts', ports),

  // Config
  getAppConfig: (): Promise<AppConfig> => ipcRenderer.invoke('get-app-config'),
  updateAppConfig: (updates: Partial<AppConfig>): Promise<AppConfig> =>
    ipcRenderer.invoke('update-app-config', updates),
  getFirstRunSummary: (): Promise<FirstRunSummary> =>
    ipcRenderer.invoke('get-first-run-summary'),

  // Event Subscriptions
  onServicesUpdated: (callback: (services: ServiceInfo[]) => void) => {
    const handler = (_: any, data: ServiceInfo[]) => callback(data);
    ipcRenderer.on('services-updated', handler);
    return () => {
      ipcRenderer.removeListener('services-updated', handler);
    };
  },
  onScanFailed: (callback: (message: string) => void) => {
    const handler = (_: any, message: string) => callback(message);
    ipcRenderer.on('scan-failed', handler);
    return () => {
      ipcRenderer.removeListener('scan-failed', handler);
    };
  },
  onWorkspaceUpdated: (callback: (workspace: Workspace) => void) => {
    const handler = (_: any, data: Workspace) => callback(data);
    ipcRenderer.on('workspace-updated', handler);
    return () => {
      ipcRenderer.removeListener('workspace-updated', handler);
    };
  },
  onWorkspaceDeleted: (callback: (id: string) => void) => {
    const handler = (_: any, id: string) => callback(id);
    ipcRenderer.on('workspace-deleted', handler);
    return () => {
      ipcRenderer.removeListener('workspace-deleted', handler);
    };
  },
  onWorkspaceLog: (callback: (log: WorkspaceExecutionLog) => void) => {
    const handler = (_: any, log: WorkspaceExecutionLog) => callback(log);
    ipcRenderer.on('workspace-log', handler);
    return () => {
      ipcRenderer.removeListener('workspace-log', handler);
    };
  }
};

contextBridge.exposeInMainWorld('localhostManagerAPI', localhostManagerAPI);
