import { contextBridge, ipcRenderer } from 'electron';
import type { AppConfig, SettingsChoice, SettingsQuestion, TerminalCreateOptions, TerminalDataEvent, TerminalExitEvent } from '../shared';

const api = {
  getConfig: () => ipcRenderer.invoke('config:get') as Promise<AppConfig>,
  saveConfig: (config: AppConfig) => ipcRenderer.invoke('config:save', config) as Promise<AppConfig>,
  askSettingsQuestion: (message: SettingsQuestion) => ipcRenderer.invoke('dialog:settings-question', message) as Promise<SettingsChoice>,
  exportConfig: (config: AppConfig) => ipcRenderer.invoke('config:export', config) as Promise<boolean>,
  importConfig: () => ipcRenderer.invoke('config:import') as Promise<AppConfig | null>,
  selectDirectory: (currentPath?: string) => ipcRenderer.invoke('dialog:select-directory', currentPath) as Promise<string | null>,
  terminalCreate: (options: TerminalCreateOptions) => ipcRenderer.invoke('terminal:create', options) as Promise<{ cwd: string }>,
  terminalInput: (id: string, data: string) => ipcRenderer.send('terminal:input', { id, data }),
  terminalResize: (id: string, cols: number, rows: number) => ipcRenderer.send('terminal:resize', { id, cols, rows }),
  terminalDispose: (id: string) => ipcRenderer.send('terminal:dispose', id),
  onTerminalData: (callback: (event: TerminalDataEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: TerminalDataEvent) => callback(payload);
    ipcRenderer.on('terminal:data', listener);
    return () => ipcRenderer.removeListener('terminal:data', listener);
  },
  onTerminalExit: (callback: (event: TerminalExitEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: TerminalExitEvent) => callback(payload);
    ipcRenderer.on('terminal:exit', listener);
    return () => ipcRenderer.removeListener('terminal:exit', listener);
  }
};

contextBridge.exposeInMainWorld('multiTerm', api);
