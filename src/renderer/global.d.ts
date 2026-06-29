import type { AppConfig, TerminalCreateOptions, TerminalDataEvent, TerminalExitEvent } from '../shared';

export {};

declare global {
  interface Window {
    multiTerm: {
      getConfig: () => Promise<AppConfig>;
      saveConfig: (config: AppConfig) => Promise<AppConfig>;
      exportConfig: (config: AppConfig) => Promise<boolean>;
      importConfig: () => Promise<AppConfig | null>;
      selectDirectory: (currentPath?: string) => Promise<string | null>;
      terminalCreate: (options: TerminalCreateOptions) => Promise<{ cwd: string }>;
      terminalInput: (id: string, data: string) => void;
      terminalResize: (id: string, cols: number, rows: number) => void;
      terminalDispose: (id: string) => void;
      onTerminalData: (callback: (event: TerminalDataEvent) => void) => () => void;
      onTerminalExit: (callback: (event: TerminalExitEvent) => void) => () => void;
    };
  }
}
