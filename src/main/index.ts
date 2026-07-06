import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as pty from 'node-pty';
import { normalizeConfig, SETTINGS_QUESTIONS, type AppConfig, type SettingsChoice, type SettingsQuestion, type TerminalCreateOptions } from '../shared';

interface TerminalSession {
  ownerId: number;
  process: pty.IPty;
  cols: number;
  rows: number;
}

const sessions = new Map<string, TerminalSession>();
let mainWindow: BrowserWindow | null = null;

function configFilePath(): string {
  return path.join(app.getPath('userData'), 'config.json');
}

function readConfig(): AppConfig {
  try {
    return normalizeConfig(JSON.parse(fs.readFileSync(configFilePath(), 'utf8')));
  } catch {
    return normalizeConfig(undefined);
  }
}

function writeConfig(config: unknown): AppConfig {
  const normalized = normalizeConfig(config);
  fs.mkdirSync(path.dirname(configFilePath()), { recursive: true });
  fs.writeFileSync(configFilePath(), JSON.stringify(normalized, null, 2), 'utf8');
  return normalized;
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 620,
    frame: false,
    title: 'MultiTerm',
    backgroundColor: '#111316',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });
  mainWindow.setMenu(null);

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

function registerIpc(): void {
  ipcMain.on('window:minimize', (event) => BrowserWindow.fromWebContents(event.sender)?.minimize());
  ipcMain.on('window:toggle-maximize', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return;
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
  });
  ipcMain.on('window:close', (event) => BrowserWindow.fromWebContents(event.sender)?.close());

  ipcMain.handle('config:get', () => readConfig());
  ipcMain.handle('config:save', (_event, config: AppConfig) => writeConfig(config));
  ipcMain.handle('dialog:settings-question', async (_event, message: unknown): Promise<SettingsChoice> => {
    if (typeof message !== 'string' || !SETTINGS_QUESTIONS.includes(message as SettingsQuestion)) return 'cancel';
    const options: Electron.MessageBoxOptions = {
      type: 'question',
      message,
      buttons: ['是', '否', '取消'],
      defaultId: 0,
      cancelId: 2,
      noLink: true
    };
    const result = mainWindow
      ? await dialog.showMessageBox(mainWindow, options)
      : await dialog.showMessageBox(options);
    return ['yes', 'no', 'cancel'][result.response] as SettingsChoice;
  });
  ipcMain.handle('config:export', async (_event, config: AppConfig) => {
    const result = await dialog.showSaveDialog({
      title: '导出配置',
      defaultPath: 'multiterm-config.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (result.canceled || !result.filePath) return false;
    fs.writeFileSync(result.filePath, JSON.stringify(normalizeConfig(config), null, 2), 'utf8');
    return true;
  });
  ipcMain.handle('config:import', async () => {
    const result = await dialog.showOpenDialog({
      title: '导入配置',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return writeConfig(JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8')));
  });
  ipcMain.handle('dialog:select-directory', async (_event, currentPath?: string) => {
    const result = await dialog.showOpenDialog({
      title: '选择工作目录',
      defaultPath: existingDirectory(currentPath),
      properties: ['openDirectory']
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('terminal:create', (event, options: TerminalCreateOptions) => {
    closeSession(options.id);
    const cwd = existingDirectory(options.cwd);
    const shell = defaultShell();
    const cols = saneDimension(options.cols, 80);
    const rows = saneDimension(options.rows, 24);
    const terminal = pty.spawn(shell.file, shell.args, {
      name: 'xterm-256color',
      cwd,
      cols,
      rows,
      env: { ...process.env, TERM: 'xterm-256color' }
    });

    sessions.set(options.id, { ownerId: event.sender.id, process: terminal, cols, rows });
    event.sender.once('destroyed', () => closeSessionsForOwner(event.sender.id));
    terminal.onData((data) => {
      if (!event.sender.isDestroyed()) event.sender.send('terminal:data', { id: options.id, data });
    });
    terminal.onExit(({ exitCode }) => {
      sessions.delete(options.id);
      if (!event.sender.isDestroyed()) event.sender.send('terminal:exit', { id: options.id, exitCode });
    });
    if (options.command.trim()) {
      setTimeout(() => terminal.write(`${options.command.trimEnd()}\r`), 120);
    }
    return { cwd };
  });

  ipcMain.on('terminal:input', (_event, payload: { id: string; data: string }) => {
    sessions.get(payload.id)?.process.write(payload.data);
  });
  ipcMain.on('terminal:resize', (_event, payload: { id: string; cols: number; rows: number }) => {
    try {
      const session = sessions.get(payload.id);
      const cols = saneDimension(payload.cols, 80);
      const rows = saneDimension(payload.rows, 24);
      if (!session || (session.cols === cols && session.rows === rows)) return;
      session.process.resize(cols, rows);
      session.cols = cols;
      session.rows = rows;
    } catch {
      // node-pty can throw if the shell exits while the renderer is resizing.
    }
  });
  ipcMain.on('terminal:dispose', (_event, id: string) => closeSession(id));
}

function closeSessionsForOwner(ownerId: number): void {
  for (const [id, session] of sessions) {
    if (session.ownerId === ownerId) closeSession(id);
  }
}

function closeSession(id: string): void {
  const session = sessions.get(id);
  if (!session) return;
  sessions.delete(id);
  try {
    session.process.kill();
  } catch {
    // Already gone.
  }
}

function existingDirectory(value?: string): string {
  if (value) {
    try {
      if (fs.statSync(value).isDirectory()) return value;
    } catch {
      // Fall back to the home directory.
    }
  }
  return os.homedir();
}

function defaultShell(): { file: string; args: string[] } {
  if (process.platform === 'win32') return { file: 'powershell.exe', args: ['-NoLogo'] };
  return { file: process.env.SHELL || '/bin/bash', args: [] };
}

function saneDimension(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

registerIpc();

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  for (const id of sessions.keys()) closeSession(id);
  if (process.platform !== 'darwin') app.quit();
});
