import { app, BrowserWindow, Tray, Menu, nativeImage, nativeTheme } from 'electron';
import path from 'path';
import { getPlatformAdapter } from './platform';
import { ConfigService } from './services/ConfigService';
import { HealthService } from './services/HealthService';
import { ProjectService } from './services/ProjectService';
import { ProcessService } from './services/ProcessService';
import { PortService } from './services/PortService';
import { LogService } from './services/LogService';
import { WorkspaceService } from './services/WorkspaceService';
import { TerminalService } from './services/TerminalService';
import { BrowserService } from './services/BrowserService';
import { registerIpcHandlers } from './ipc';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

const isDev = process.env.NODE_ENV !== 'production' || !!process.env.VITE_DEV_SERVER_URL;

/** Assets ship as extraResources when packaged, and sit at the repo root in dev. */
function assetPath(file: string): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'assets', file)
    : path.join(__dirname, '../../assets', file);
}

// Instantiate services
const platformAdapter = getPlatformAdapter();
const configService = new ConfigService();
const healthService = new HealthService();
const projectService = new ProjectService();
const processService = new ProcessService(platformAdapter, configService);
const portService = new PortService(platformAdapter, projectService, healthService, processService, configService);
const logService = new LogService();
const workspaceService = new WorkspaceService(logService, platformAdapter, portService);
const terminalService = new TerminalService(platformAdapter, configService);
const browserService = new BrowserService(platformAdapter);

/** Matches --canvas in the renderer, so the window frame never flashes the wrong shade. */
function canvasColor(): string {
  const { theme } = configService.getConfig();
  const dark = theme === 'dark' || (theme === 'system' && nativeTheme.shouldUseDarkColors);
  return dark ? '#0C0E13' : '#F7F8FA';
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 920,
    minHeight: 620,
    backgroundColor: canvasColor(),
    title: 'Localhost Manager',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(__dirname, '../../dist-renderer/index.html'));
  }

  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('Renderer process gone:', details.reason, details.exitCode);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    // Never open a second Electron window for a link; hand it to the real browser.
    if (url.startsWith('http:') || url.startsWith('https:')) {
      browserService.openUrl(url);
    }
    return { action: 'deny' };
  });

  win.on('close', (e) => {
    const config = configService.getConfig();
    if (config.closeToTray && !isQuitting) {
      e.preventDefault();
      win.hide();
    }
  });

  return win;
}

function updateTrayMenu() {
  if (!tray) return;

  const services = portService.getServices();
  const devServices = services.filter((s) => s.isDevProcess);

  const portItems = devServices.slice(0, 8).map((s) => ({
    label: `${s.port}  ${s.projectName || s.framework?.name || s.processName}`,
    click: () => {
      browserService.openUrl(s.url);
    }
  }));

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Localhost Manager',
      enabled: false
    },
    { type: 'separator' },
    ...(portItems.length > 0
      ? [...portItems, { type: 'separator' as const }]
      : [{ label: 'No dev services running', enabled: false }, { type: 'separator' as const }]),
    {
      label: 'Open Dashboard',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: 'Refresh Ports',
      click: () => {
        portService.refreshServices();
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip(
    devServices.length === 1
      ? 'Localhost Manager - 1 dev service'
      : `Localhost Manager - ${devServices.length} dev services`
  );
}

function destroyTray() {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

function createTray() {
  if (tray) return;
  try {
    // A *Template image is tinted by macOS to match the menu bar in light and dark.
    const icon = nativeImage.createFromPath(assetPath('trayTemplate.png'));
    icon.setTemplateImage(true);

    tray = new Tray(icon);
    updateTrayMenu();

    tray.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.focus();
        } else {
          mainWindow.show();
        }
      }
    });
  } catch (err) {
    console.warn('Tray creation failed:', err);
  }
}

// Two copies would poll the process table in parallel and fight over the tray icon.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

// A monitoring tool must not die silently on a rejected promise from a shell probe.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection in main process:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception in main process:', err);
});

app.whenReady().then(() => {
  mainWindow = createWindow();

  // Register IPC
  registerIpcHandlers(() => mainWindow, {
    portService,
    processService,
    workspaceService,
    logService,
    terminalService,
    browserService,
    configService,
    platformAdapter
  });

  // Start polling
  portService.startPolling();
  portService.on('services-updated', () => {
    updateTrayMenu();
  });

  if (configService.getConfig().enableTray) {
    createTray();
  }

  configService.on('config-changed', (next) => {
    if (next.enableTray) createTray();
    else destroyTray();
    mainWindow?.setBackgroundColor(canvasColor());
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

app.on('before-quit', () => {
  isQuitting = true;
  portService.stopPolling();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
