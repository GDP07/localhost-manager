import { ipcMain, dialog, BrowserWindow } from 'electron';
import { PortService } from '../services/PortService';
import { ProcessService } from '../services/ProcessService';
import { WorkspaceService } from '../services/WorkspaceService';
import { LogService } from '../services/LogService';
import { TerminalService } from '../services/TerminalService';
import { BrowserService } from '../services/BrowserService';
import { ConfigService } from '../services/ConfigService';
import { PlatformAdapter } from '../platform/PlatformAdapter';
import { AppConfig } from '../../shared/types/config';
import { Workspace } from '../../shared/types/workspace';

export function registerIpcHandlers(
  getMainWindow: () => BrowserWindow | null,
  services: {
    portService: PortService;
    processService: ProcessService;
    workspaceService: WorkspaceService;
    logService: LogService;
    terminalService: TerminalService;
    browserService: BrowserService;
    configService: ConfigService;
    platformAdapter: PlatformAdapter;
  }
) {
  const {
    portService,
    processService,
    workspaceService,
    logService,
    terminalService,
    browserService,
    configService,
    platformAdapter
  } = services;

  // Broadcast events to renderer
  portService.on('services-updated', (data) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('services-updated', data);
    }
  });

  portService.on('scan-failed', (message: string) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('scan-failed', message);
    }
  });

  workspaceService.on('workspace-updated', (ws) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('workspace-updated', ws);
    }
  });

  workspaceService.on('workspace-deleted', (id) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('workspace-deleted', id);
    }
  });

  logService.on('new-log', (entry) => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('workspace-log', entry);
    }
  });

  // Services IPC
  ipcMain.handle('get-services', async () => {
    return portService.getServices();
  });

  ipcMain.handle('refresh-services', async () => {
    return portService.refreshServices();
  });

  ipcMain.handle('get-process-tree', async (_, pid: number) => {
    if (typeof pid !== 'number' || pid <= 0) return null;
    return processService.getProcessTree(pid);
  });

  ipcMain.handle('stop-process', async (_, { pid, force }: { pid: number; force?: boolean }) => {
    if (typeof pid !== 'number' || pid <= 0) return { success: false, error: 'Invalid PID' };
    const success = await processService.stopProcess(pid, force);
    if (success) {
      setTimeout(() => portService.refreshServices(), 500);
    }
    return { success };
  });

  ipcMain.handle('stop-process-tree', async (_, { pid, force }: { pid: number; force?: boolean }) => {
    if (typeof pid !== 'number' || pid <= 0) return { success: false, error: 'Invalid PID' };
    const success = await processService.stopProcessTree(pid, force);
    if (success) {
      setTimeout(() => portService.refreshServices(), 500);
    }
    return { success };
  });

  ipcMain.handle('stop-all-dev-processes', async () => {
    const currentServices = portService.getServices();
    const result = await processService.stopAllDevProcesses(currentServices);
    setTimeout(() => portService.refreshServices(), 500);
    return result;
  });

  // Navigation & Tools
  ipcMain.handle('open-in-browser', async (_, url: string) => {
    if (typeof url !== 'string' || !url.startsWith('http')) {
      return { success: false, error: 'Invalid URL' };
    }
    return browserService.openUrl(url);
  });

  ipcMain.handle('open-in-terminal', async (_, dirPath: string) => {
    if (typeof dirPath !== 'string' || !dirPath.trim()) {
      return { success: false, error: 'Invalid directory' };
    }
    return terminalService.openTerminal(dirPath);
  });

  ipcMain.handle('show-item-in-folder', async (_, filePath: string) => {
    if (typeof filePath !== 'string' || !filePath.trim()) return false;
    await platformAdapter.showInFileManager(filePath);
    return true;
  });

  ipcMain.handle('select-directory', async () => {
    const win = getMainWindow();
    const result = await dialog.showOpenDialog(win || undefined as any, {
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  // Workspaces IPC
  ipcMain.handle('get-workspaces', async () => {
    return workspaceService.getWorkspaces();
  });

  ipcMain.handle('save-workspace', async (_, workspace: Partial<Workspace> & { name: string; directory: string }) => {
    return workspaceService.saveWorkspace(workspace);
  });

  ipcMain.handle('delete-workspace', async (_, id: string) => {
    return workspaceService.deleteWorkspace(id);
  });

  ipcMain.handle('start-workspace', async (_, { id, bypassConflictCheck }: { id: string; bypassConflictCheck?: boolean }) => {
    return workspaceService.startWorkspace(id, bypassConflictCheck);
  });

  ipcMain.handle('stop-workspace', async (_, id: string) => {
    return workspaceService.stopWorkspace(id);
  });

  ipcMain.handle('restart-workspace', async (_, id: string) => {
    return workspaceService.restartWorkspace(id);
  });

  ipcMain.handle('get-workspace-logs', async (_, workspaceId: string) => {
    return logService.getLogs(workspaceId);
  });

  ipcMain.handle('clear-workspace-logs', async (_, workspaceId: string) => {
    logService.clearLogs(workspaceId);
    return true;
  });

  ipcMain.handle('check-port-conflicts', async (_, ports: number[]) => {
    return workspaceService.checkPortConflicts(ports);
  });

  // Configuration IPC
  ipcMain.handle('get-app-config', async () => {
    return configService.getConfig();
  });

  ipcMain.handle('update-app-config', async (_, updates: Partial<AppConfig>) => {
    return configService.updateConfig(updates);
  });

  ipcMain.handle('get-first-run-summary', async () => {
    const services = await portService.refreshServices();
    const devServices = services.filter((s) => s.isDevProcess);
    const projects = new Set(devServices.map((s) => s.projectName).filter(Boolean));
    const workspaces = workspaceService.getWorkspaces();

    return {
      portsCount: services.length,
      projectsCount: projects.size,
      devEnvironmentsCount: workspaces.length
    };
  });
}
