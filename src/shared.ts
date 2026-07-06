export const CONSOLE_SLOTS = [
  { id: '1', title: '左上角', area: 'top-left' },
  { id: '2', title: '左下角', area: 'bottom-left' },
  { id: '3', title: '右上角', area: 'top-right' },
  { id: '4', title: '右下角', area: 'bottom-right' }
] as const;

export type ConsoleId = (typeof CONSOLE_SLOTS)[number]['id'];
export type ThemeId = 'system' | 'dark' | 'light';
export type LayoutId = 'grid-2x2';

export interface ConsolePreset {
  id: ConsoleId;
  name: string;
  cwd: string;
  command: string;
}

export interface PresetProfile {
  id: string;
  name: string;
  consoles: ConsolePreset[];
}

export interface AppConfig {
  openDefaultPresetOnStart: boolean;
  defaultPresetId: string;
  startupLayout: LayoutId;
  theme: ThemeId;
  fontSize: number;
  focusTopLeftOnStart: boolean;
  enableNotifications: boolean;
  presetProfiles: PresetProfile[];
}

export interface TerminalCreateOptions {
  id: string;
  cwd: string;
  command: string;
  cols: number;
  rows: number;
}

export interface TerminalDataEvent {
  id: string;
  data: string;
}

export interface TerminalExitEvent {
  id: string;
  exitCode: number;
}

export interface TerminalKeyEvent {
  type: string;
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}

export const SETTINGS_QUESTIONS = ['保存后是否重新加载界面？', '是否保存本次修改？'] as const;
export type SettingsQuestion = (typeof SETTINGS_QUESTIONS)[number];
export type SettingsChoice = 'yes' | 'no' | 'cancel';

export const DEFAULT_CONFIG: AppConfig = {
  openDefaultPresetOnStart: true,
  defaultPresetId: 'default',
  startupLayout: 'grid-2x2',
  theme: 'dark',
  fontSize: 14,
  focusTopLeftOnStart: true,
  enableNotifications: true,
  presetProfiles: [
    {
      id: 'default',
      name: '默认预设',
      consoles: CONSOLE_SLOTS.map((slot) => ({
        id: slot.id,
        name: slot.title,
        cwd: '',
        command: ''
      }))
    }
  ]
};

export function cloneConfig(config: AppConfig = DEFAULT_CONFIG): AppConfig {
  return JSON.parse(JSON.stringify(config)) as AppConfig;
}

export function sameConfig(a: AppConfig, b: AppConfig): boolean {
  return JSON.stringify(normalizeConfig(a)) === JSON.stringify(normalizeConfig(b));
}

export function terminalInputForKey(event: TerminalKeyEvent): string | null {
  return event.type === 'keydown' && event.key === 'Enter' && event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey
    ? '\n'
    : null;
}

export function shouldForwardImeText(data: string | null, inputType: string, isComposing: boolean): data is string {
  return inputType === 'insertText' && !isComposing && !!data && /[\u3000-\u303f\uff00-\uffef]/u.test(data);
}

export function normalizeConfig(value: unknown): AppConfig {
  const input = isRecord(value) ? value : {};
  const presetProfiles = normalizeProfiles(input.presetProfiles);
  const requestedDefault = text(input.defaultPresetId, DEFAULT_CONFIG.defaultPresetId);
  const defaultPresetId = presetProfiles.some((profile) => profile.id === requestedDefault)
    ? requestedDefault
    : presetProfiles[0].id;

  return {
    openDefaultPresetOnStart: bool(input.openDefaultPresetOnStart, DEFAULT_CONFIG.openDefaultPresetOnStart),
    defaultPresetId,
    startupLayout: input.startupLayout === 'grid-2x2' ? 'grid-2x2' : DEFAULT_CONFIG.startupLayout,
    theme: input.theme === 'system' || input.theme === 'dark' || input.theme === 'light' ? input.theme : DEFAULT_CONFIG.theme,
    fontSize: clamp(num(input.fontSize, DEFAULT_CONFIG.fontSize), 10, 24),
    focusTopLeftOnStart: bool(input.focusTopLeftOnStart, DEFAULT_CONFIG.focusTopLeftOnStart),
    enableNotifications: bool(input.enableNotifications, DEFAULT_CONFIG.enableNotifications),
    presetProfiles
  };
}

function normalizeProfiles(value: unknown): PresetProfile[] {
  const profiles = Array.isArray(value) ? value : DEFAULT_CONFIG.presetProfiles;
  const seen = new Set<string>();
  const normalized = profiles
    .map((profile, index) => {
      const input = isRecord(profile) ? profile : {};
      const rawId = text(input.id, index === 0 ? 'default' : `preset-${index}`);
      const id = seen.has(rawId) ? `${rawId}-${index}` : rawId;
      seen.add(id);
      return {
        id,
        name: text(input.name, index === 0 ? '默认预设' : `预设 ${index + 1}`),
        consoles: normalizeConsoles(input.consoles)
      };
    })
    .filter((profile) => profile.name.trim().length > 0);

  return normalized.length > 0 ? normalized : cloneConfig().presetProfiles;
}

function normalizeConsoles(value: unknown): ConsolePreset[] {
  const consoles = Array.isArray(value) ? value : [];
  return CONSOLE_SLOTS.map((slot, index) => {
    const byId = consoles.find((consolePreset) => isRecord(consolePreset) && consolePreset.id === slot.id);
    const input = isRecord(byId) ? byId : isRecord(consoles[index]) ? consoles[index] : {};
    return {
      id: slot.id,
      name: text(input.name, slot.title),
      cwd: text(input.cwd, ''),
      command: text(input.command, '')
    };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function text(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
