import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import {
  cloneConfig,
  CONSOLE_SLOTS,
  DEFAULT_CONFIG,
  sameConfig,
  shouldForwardImeText,
  terminalInputForKey,
  type AppConfig,
  type ConsoleId,
  type ConsolePreset,
  type PresetProfile,
  type ThemeId
} from '../shared';

const blankProfile: PresetProfile = {
  id: 'blank',
  name: '空白',
  consoles: CONSOLE_SLOTS.map((slot) => ({ id: slot.id, name: slot.title, cwd: '', command: '' }))
};

const terminalThemes = {
  dark: {
    background: '#080b0e',
    foreground: '#d9e2ef',
    cursor: '#ffffff',
    selectionBackground: '#35577a',
    black: '#0b0f14',
    red: '#ff6b6b',
    green: '#66e06f',
    yellow: '#ffd166',
    blue: '#56a8ff',
    magenta: '#c792ea',
    cyan: '#5de4c7',
    white: '#e5edf5'
  },
  light: {
    background: '#fbfbfc',
    foreground: '#1f2328',
    cursor: '#1f2328',
    selectionBackground: '#b9d7ff',
    black: '#24292f',
    red: '#cf222e',
    green: '#116329',
    yellow: '#9a6700',
    blue: '#0969da',
    magenta: '#8250df',
    cyan: '#1b7c83',
    white: '#f6f8fa'
  }
};

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);
  const systemDark = useSystemDark();

  useEffect(() => {
    void window.multiTerm.getConfig().then(setConfig);
  }, []);

  if (!config) return <div className="boot-screen">MultiTerm</div>;

  const theme = resolveTheme(config.theme, systemDark);
  const selectedProfile = config.presetProfiles.find((profile) => profile.id === config.defaultPresetId) ?? config.presetProfiles[0];
  const activeProfile = config.openDefaultPresetOnStart ? selectedProfile : blankProfile;

  async function saveConfig(next: AppConfig, reload: boolean) {
    const saved = await window.multiTerm.saveConfig(next);
    setConfig(saved);
    if (reload) setSessionKey((value) => value + 1);
    setSettingsOpen(false);
  }

  return (
    <main className={`app ${theme}`}>
      <header className="app-header">
        <div className="window-title">MultiTerm</div>
        <button className="icon-button" type="button" title="设置" aria-label="设置" onClick={() => setSettingsOpen(true)}>
          ⚙
        </button>
      </header>
      <TerminalGrid
        key={sessionKey}
        sessionKey={sessionKey}
        profile={activeProfile}
        config={config}
        theme={theme}
      />
      {settingsOpen && (
        <SettingsDialog
          config={config}
          onClose={() => setSettingsOpen(false)}
          onSave={saveConfig}
          onImport={(imported) => {
            setConfig(imported);
            setSessionKey((value) => value + 1);
          }}
        />
      )}
    </main>
  );
}

function TerminalGrid({
  sessionKey,
  profile,
  config,
  theme
}: {
  sessionKey: number;
  profile: PresetProfile;
  config: AppConfig;
  theme: 'dark' | 'light';
}) {
  const [left, setLeft] = useState(50);
  const [top, setTop] = useState(50);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const consoles = useMemo(
    () => CONSOLE_SLOTS.map((slot) => profile.consoles.find((consolePreset) => consolePreset.id === slot.id) ?? blankProfile.consoles[Number(slot.id) - 1]),
    [profile]
  );

  function startDrag(axis: 'x' | 'y', event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const rect = gridRef.current?.getBoundingClientRect();
    if (!rect) return;
    const onMove = (moveEvent: globalThis.PointerEvent) => {
      if (axis === 'x') setLeft(clamp(((moveEvent.clientX - rect.left) / rect.width) * 100, 24, 76));
      if (axis === 'y') setTop(clamp(((moveEvent.clientY - rect.top) / rect.height) * 100, 24, 76));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  return (
    <section
      ref={gridRef}
      className="terminal-grid"
      style={{ '--left-column': `${left}%`, '--top-row': `${top}%` } as CSSProperties}
    >
      {consoles.map((consolePreset) => (
        <TerminalPane
          key={consolePreset.id}
          sessionKey={sessionKey}
          pane={consolePreset}
          theme={theme}
          fontSize={config.fontSize}
          shouldFocus={config.focusTopLeftOnStart && consolePreset.id === '1'}
          notifications={config.enableNotifications}
        />
      ))}
      <div className="splitter splitter-x" onPointerDown={(event) => startDrag('x', event)} />
      <div className="splitter splitter-y" onPointerDown={(event) => startDrag('y', event)} />
    </section>
  );
}

function TerminalPane({
  sessionKey,
  pane,
  theme,
  fontSize,
  shouldFocus,
  notifications
}: {
  sessionKey: number;
  pane: ConsolePreset;
  theme: 'dark' | 'light';
  fontSize: number;
  shouldFocus: boolean;
  notifications: boolean;
}) {
  const [restartKey, setRestartKey] = useState(0);
  const [status, setStatus] = useState('启动中');
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; hasSelection: boolean } | null>(null);
  const terminalId = `${sessionKey}:${pane.id}:${restartKey}`;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const resizeTimerRef = useRef<number | null>(null);
  const selectionStartRef = useRef<{ x: number; y: number } | null>(null);
  const paneNameRef = useRef(pane.name);
  const notificationsRef = useRef(notifications);

  paneNameRef.current = pane.name;
  notificationsRef.current = notifications;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    setStatus('启动中');
    const terminal = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: 'Cascadia Mono, Consolas, Menlo, monospace',
      fontSize,
      scrollback: 5000,
      theme: terminalThemes[theme]
    });
    const fit = new FitAddon();
    const search = new SearchAddon();
    terminal.loadAddon(fit);
    terminal.loadAddon(search);
    terminal.open(container);
    terminalRef.current = terminal;
    searchRef.current = search;

    const forwardImeText = (event: InputEvent) => {
      if (!shouldForwardImeText(event.data, event.inputType, event.isComposing)) return;
      event.preventDefault();
      window.multiTerm.terminalInput(terminalId, event.data);
    };
    terminal.textarea?.addEventListener('beforeinput', forwardImeText);

    const fitAndResize = () => {
      try {
        fit.fit();
        terminal.scrollToBottom();
        if (resizeTimerRef.current) window.clearTimeout(resizeTimerRef.current);
        resizeTimerRef.current = window.setTimeout(() => {
          window.multiTerm.terminalResize(terminalId, terminal.cols, terminal.rows);
          resizeTimerRef.current = null;
        }, 120);
      } catch {
        // The terminal can be measured before layout settles.
      }
    };

    const resizeObserver = new ResizeObserver(fitAndResize);
    resizeObserver.observe(container);
    const input = terminal.onData((data) => window.multiTerm.terminalInput(terminalId, data));
    const bell = terminal.onBell(() => notify(paneNameRef.current, notificationsRef.current));
    const offData = window.multiTerm.onTerminalData((event) => {
      if (event.id === terminalId) terminal.write(event.data);
    });
    const offExit = window.multiTerm.onTerminalExit((event) => {
      if (event.id === terminalId) setStatus(`已退出 ${event.exitCode}`);
    });

    terminal.attachCustomKeyEventHandler((event) => {
      const inputData = terminalInputForKey(event);
      if (inputData !== null) {
        event.preventDefault();
        event.stopPropagation();
        window.multiTerm.terminalInput(terminalId, inputData);
        return false;
      }
      if (event.type !== 'keydown') return true;
      if (event.ctrlKey && event.shiftKey && event.code === 'KeyC') {
        document.execCommand('copy');
        return false;
      }
      if (event.ctrlKey && event.shiftKey && event.code === 'KeyV') {
        event.preventDefault();
        event.stopPropagation();
        void pasteClipboard();
        return false;
      }
      if (event.ctrlKey && event.code === 'KeyF') {
        setSearchOpen(true);
        return false;
      }
      return true;
    });

    requestAnimationFrame(() => {
      fitAndResize();
      void window.multiTerm
        .terminalCreate({ id: terminalId, cwd: pane.cwd, command: pane.command, cols: terminal.cols, rows: terminal.rows })
        .then(() => {
          setStatus('运行中');
          if (shouldFocus) terminal.focus();
        })
        .catch((error) => {
          setStatus('启动失败');
          terminal.writeln(`\r\n[启动失败] ${String(error)}`);
        });
    });

    return () => {
      if (resizeTimerRef.current) window.clearTimeout(resizeTimerRef.current);
      resizeObserver.disconnect();
      input.dispose();
      bell.dispose();
      offData();
      offExit();
      terminal.textarea?.removeEventListener('beforeinput', forwardImeText);
      window.multiTerm.terminalDispose(terminalId);
      terminal.dispose();
      terminalRef.current = null;
      searchRef.current = null;
    };
  }, [terminalId]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.fontSize = fontSize;
    terminal.options.theme = terminalThemes[theme];
  }, [fontSize, theme]);

  const slot = CONSOLE_SLOTS.find((item) => item.id === pane.id)!;

  function openContextMenu(event: MouseEvent<HTMLDivElement>) {
    if (event.button !== 2) return;
    event.preventDefault();
    event.stopPropagation();
    const terminal = terminalRef.current;
    if (!terminal) return;
    setContextMenu({ x: event.clientX, y: event.clientY, hasSelection: terminal.getSelection().length > 0 });
  }

  function rememberSelectionStart(event: MouseEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    selectionStartRef.current = { x: event.clientX, y: event.clientY };
  }

  function openSelectionMenu(event: MouseEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const start = selectionStartRef.current;
    selectionStartRef.current = null;
    if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) < 4) {
      terminalRef.current?.clearSelection();
      setContextMenu(null);
      return;
    }
    requestAnimationFrame(() => {
      if ((terminalRef.current?.getSelection() ?? '').length > 0) {
        setContextMenu({ x: event.clientX, y: event.clientY, hasSelection: true });
      }
    });
  }

  function blockContextMenu(event: MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
  }

  async function copySelection() {
    try {
      const text = terminalRef.current?.getSelection() ?? '';
      if (text) await navigator.clipboard.writeText(text);
    } finally {
      setContextMenu(null);
      terminalRef.current?.focus();
    }
  }

  async function pasteClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) window.multiTerm.terminalInput(terminalId, text);
      terminalRef.current?.clearSelection();
    } finally {
      setContextMenu(null);
      terminalRef.current?.focus();
    }
  }

  function findNext() {
    if (query.trim()) searchRef.current?.findNext(query);
  }

  return (
    <article className={`terminal-pane ${slot.area}`}>
      <div className="pane-header">
        <button className="pane-title" type="button" title="聚焦终端" onClick={() => terminalRef.current?.focus()}>
          <span>{pane.id}: {pane.name}</span>
          <small>{status}</small>
        </button>
        <div className="pane-actions">
          <button className="icon-button small" type="button" title="搜索" aria-label="搜索" onClick={() => setSearchOpen((value) => !value)}>
            ⌕
          </button>
          <button className="icon-button small" type="button" title="重启终端" aria-label="重启终端" onClick={() => setRestartKey((value) => value + 1)}>
            ↻
          </button>
        </div>
      </div>
      {searchOpen && (
        <div className="search-bar">
          <input
            autoFocus
            value={query}
            placeholder="搜索终端内容"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') findNext();
              if (event.key === 'Escape') setSearchOpen(false);
            }}
          />
          <button type="button" onClick={findNext}>下一个</button>
        </div>
      )}
      <div
        ref={containerRef}
        className="terminal-host"
        onMouseDownCapture={openContextMenu}
        onMouseDown={rememberSelectionStart}
        onMouseUpCapture={openSelectionMenu}
        onContextMenuCapture={blockContextMenu}
      />
      {contextMenu && (
        <TerminalContextMenu
          theme={theme}
          x={contextMenu.x}
          y={contextMenu.y}
          hasSelection={contextMenu.hasSelection}
          onCopy={copySelection}
          onPaste={pasteClipboard}
          onClose={() => setContextMenu(null)}
        />
      )}
    </article>
  );
}

function TerminalContextMenu({
  theme,
  x,
  y,
  hasSelection,
  onCopy,
  onPaste,
  onClose
}: {
  theme: 'dark' | 'light';
  x: number;
  y: number;
  hasSelection: boolean;
  onCopy: () => void;
  onPaste: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const left = Math.max(8, Math.min(x, window.innerWidth - 204));
  const top = Math.max(8, Math.min(y, window.innerHeight - (hasSelection ? 82 : 46)));

  return createPortal(
    <div
      className={`context-menu-layer ${theme}`}
      role="presentation"
      onPointerDown={onClose}
      onContextMenu={(event) => {
        event.preventDefault();
      }}
    >
      <div
        className="context-menu"
        role="menu"
        style={{ left, top }}
        onPointerDown={(event) => event.stopPropagation()}
        onContextMenu={(event) => event.preventDefault()}
      >
        {hasSelection && (
          <button type="button" role="menuitem" onClick={onCopy}>
            <span>复制</span>
            <kbd>Ctrl+Shift+C</kbd>
          </button>
        )}
        <button type="button" role="menuitem" onClick={onPaste}>
          <span>粘贴</span>
          <kbd>Ctrl+Shift+V</kbd>
        </button>
      </div>
    </div>,
    document.body
  );
}

function SettingsDialog({
  config,
  onClose,
  onSave,
  onImport
}: {
  config: AppConfig;
  onClose: () => void;
  onSave: (config: AppConfig, reload: boolean) => Promise<void>;
  onImport: (config: AppConfig) => void;
}) {
  const [draft, setDraft] = useState(() => cloneConfig(config));
  const [activeProfileId, setActiveProfileId] = useState(config.defaultPresetId);
  const activeProfile = draft.presetProfiles.find((profile) => profile.id === activeProfileId) ?? draft.presetProfiles[0];

  function patch(patchConfig: Partial<AppConfig>) {
    setDraft((current) => ({ ...current, ...patchConfig }));
  }

  function patchProfile(id: string, patchPreset: Partial<PresetProfile>) {
    setDraft((current) => ({
      ...current,
      presetProfiles: current.presetProfiles.map((profile) => (profile.id === id ? { ...profile, ...patchPreset } : profile))
    }));
  }

  function patchConsole(consoleId: ConsoleId, patchPreset: Partial<ConsolePreset>) {
    setDraft((current) => ({
      ...current,
      presetProfiles: current.presetProfiles.map((profile) =>
        profile.id === activeProfile.id
          ? {
              ...profile,
              consoles: profile.consoles.map((consolePreset) =>
                consolePreset.id === consoleId ? { ...consolePreset, ...patchPreset } : consolePreset
              )
            }
          : profile
      )
    }));
  }

  function addProfile() {
    const id = `preset-${Date.now()}`;
    const profile: PresetProfile = {
      id,
      name: '新预设',
      consoles: CONSOLE_SLOTS.map((slot) => ({ id: slot.id, name: slot.title, cwd: '', command: '' }))
    };
    setDraft((current) => ({ ...current, defaultPresetId: id, presetProfiles: [...current.presetProfiles, profile] }));
    setActiveProfileId(id);
  }

  function deleteProfile() {
    if (draft.presetProfiles.length <= 1) return;
    const remaining = draft.presetProfiles.filter((profile) => profile.id !== activeProfile.id);
    setDraft((current) => ({
      ...current,
      presetProfiles: remaining,
      defaultPresetId: current.defaultPresetId === activeProfile.id ? remaining[0].id : current.defaultPresetId
    }));
    setActiveProfileId(remaining[0].id);
  }

  async function chooseDirectory(consoleId: ConsoleId, currentPath: string) {
    const directory = await window.multiTerm.selectDirectory(currentPath);
    if (directory) patchConsole(consoleId, { cwd: directory });
  }

  async function importConfig() {
    const imported = await window.multiTerm.importConfig();
    if (!imported) return;
    setDraft(imported);
    setActiveProfileId(imported.defaultPresetId);
    onImport(imported);
  }

  async function close() {
    if (sameConfig(config, draft)) return onClose();
    const choice = await window.multiTerm.askSettingsQuestion('是否保存本次修改？');
    if (choice === 'yes') return onSave(draft, false);
    if (choice === 'no') onClose();
  }

  async function save() {
    if (sameConfig(config, draft)) return onClose();
    const choice = await window.multiTerm.askSettingsQuestion('保存后是否重新加载界面？');
    if (choice !== 'cancel') await onSave(draft, choice === 'yes');
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="settings-modal" role="dialog" aria-modal="true" aria-label="设置">
        <header className="settings-header">
          <h1>设置</h1>
          <button className="icon-button" type="button" title="关闭" aria-label="关闭" onClick={close}>×</button>
        </header>
        <div className="settings-body">
          <nav className="settings-nav">
            <a href="#general">通用设置</a>
            <a href="#presets">预设管理</a>
          </nav>
          <div className="settings-content">
            <section id="general" className="settings-section">
              <h2>启动行为</h2>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={draft.openDefaultPresetOnStart}
                  onChange={(event) => patch({ openDefaultPresetOnStart: event.target.checked })}
                />
                <span>启动时打开默认预设</span>
              </label>
              <div className="form-grid two">
                <label>
                  <span>默认预设</span>
                  <select value={draft.defaultPresetId} onChange={(event) => patch({ defaultPresetId: event.target.value })}>
                    {draft.presetProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>{profile.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>启动时窗口布局</span>
                  <select value={draft.startupLayout} onChange={() => patch({ startupLayout: 'grid-2x2' })}>
                    <option value="grid-2x2">四分屏（2x2）</option>
                  </select>
                </label>
              </div>
              <h2>外观设置</h2>
              <div className="form-grid two">
                <label>
                  <span>主题</span>
                  <select value={draft.theme} onChange={(event) => patch({ theme: event.target.value as ThemeId })}>
                    <option value="system">跟随系统</option>
                    <option value="dark">暗色</option>
                    <option value="light">亮色</option>
                  </select>
                </label>
                <label>
                  <span>字体大小：{draft.fontSize}px</span>
                  <input
                    type="range"
                    min="10"
                    max="24"
                    value={draft.fontSize}
                    onChange={(event) => patch({ fontSize: Number(event.target.value) })}
                  />
                </label>
              </div>
              <h2>终端行为</h2>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={draft.focusTopLeftOnStart}
                  onChange={(event) => patch({ focusTopLeftOnStart: event.target.checked })}
                />
                <span>启动时聚焦到左上角终端</span>
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={draft.enableNotifications}
                  onChange={(event) => patch({ enableNotifications: event.target.checked })}
                />
                <span>允许终端通知提醒</span>
              </label>
            </section>
            <section id="presets" className="settings-section">
              <div className="section-title-row">
                <h2>预设管理</h2>
                <div className="button-row">
                  <button type="button" onClick={addProfile}>添加预设</button>
                  <button type="button" onClick={deleteProfile} disabled={draft.presetProfiles.length <= 1}>删除预设</button>
                </div>
              </div>
              <div className="form-grid two">
                <label>
                  <span>当前预设</span>
                  <select value={activeProfile.id} onChange={(event) => setActiveProfileId(event.target.value)}>
                    {draft.presetProfiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>{profile.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>预设名称</span>
                  <input value={activeProfile.name} onChange={(event) => patchProfile(activeProfile.id, { name: event.target.value })} />
                </label>
              </div>
              <div className="preset-table">
                <div className="preset-heading">面板</div>
                <div className="preset-heading">名称</div>
                <div className="preset-heading">工作目录</div>
                <div className="preset-heading">启动命令</div>
                {activeProfile.consoles.map((consolePreset) => (
                  <PresetRow
                    key={consolePreset.id}
                    consolePreset={consolePreset}
                    onPatch={(patchPreset) => patchConsole(consolePreset.id, patchPreset)}
                    onChooseDirectory={() => chooseDirectory(consolePreset.id, consolePreset.cwd)}
                  />
                ))}
              </div>
            </section>
          </div>
        </div>
        <footer className="settings-footer">
          <div className="button-row">
            <button type="button" onClick={() => window.multiTerm.exportConfig(draft)}>导出配置</button>
            <button type="button" onClick={importConfig}>导入配置</button>
          </div>
          <div className="button-row">
            <button type="button" onClick={() => setDraft(cloneConfig(DEFAULT_CONFIG))}>重置为默认</button>
            <button type="button" className="primary" onClick={save}>保存</button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function PresetRow({
  consolePreset,
  onPatch,
  onChooseDirectory
}: {
  consolePreset: ConsolePreset;
  onPatch: (patch: Partial<ConsolePreset>) => void;
  onChooseDirectory: () => void;
}) {
  const slot = CONSOLE_SLOTS.find((item) => item.id === consolePreset.id)!;
  return (
    <>
      <div className="preset-cell label-cell">{consolePreset.id}（{slot.title}）</div>
      <div className="preset-cell">
        <input value={consolePreset.name} onChange={(event) => onPatch({ name: event.target.value })} />
      </div>
      <div className="preset-cell path-cell">
        <input value={consolePreset.cwd} placeholder="留空使用用户主目录" onChange={(event) => onPatch({ cwd: event.target.value })} />
        <button type="button" className="icon-button small" title="选择目录" aria-label="选择目录" onClick={onChooseDirectory}>…</button>
      </div>
      <div className="preset-cell">
        <input value={consolePreset.command} placeholder="可留空" onChange={(event) => onPatch({ command: event.target.value })} />
      </div>
    </>
  );
}

function useSystemDark() {
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true);
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media) return;
    const listener = () => setSystemDark(media.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);
  return systemDark;
}

function resolveTheme(theme: ThemeId, systemDark: boolean): 'dark' | 'light' {
  return theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
}

async function notify(name: string, enabled: boolean) {
  if (!enabled || !('Notification' in window)) return;
  if (Notification.permission === 'default') await Notification.requestPermission();
  if (Notification.permission === 'granted') new Notification(`MultiTerm：${name}`, { body: '终端收到提醒' });
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
