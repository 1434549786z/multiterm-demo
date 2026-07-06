import { cloneConfig, normalizeConfig, sameConfig, shouldForwardImeText, terminalInputForKey } from './shared';

const config = normalizeConfig({
  defaultPresetId: 'work',
  fontSize: 99,
  presetProfiles: [
    {
      id: 'work',
      name: '工作',
      consoles: [{ id: '3', name: '服务', cwd: 'F:\\work', command: 'npm run dev' }]
    }
  ]
});

console.assert(config.defaultPresetId === 'work', 'keeps an existing default preset');
console.assert(config.fontSize === 24, 'clamps font size');
console.assert(config.presetProfiles[0].consoles.length === 4, 'always keeps four consoles');
console.assert(config.presetProfiles[0].consoles[2].command === 'npm run dev', 'matches console presets by id');

const clone = cloneConfig(config);
console.assert(sameConfig(config, clone), 'detects unchanged config');
clone.fontSize = 18;
console.assert(!sameConfig(config, clone), 'detects changed config');
const reordered = {
  presetProfiles: config.presetProfiles,
  enableNotifications: config.enableNotifications,
  focusTopLeftOnStart: config.focusTopLeftOnStart,
  fontSize: config.fontSize,
  theme: config.theme,
  startupLayout: config.startupLayout,
  defaultPresetId: config.defaultPresetId,
  openDefaultPresetOnStart: config.openDefaultPresetOnStart
};
console.assert(sameConfig(config, reordered), 'ignores object key insertion order');

console.assert(
  terminalInputForKey({ type: 'keydown', key: 'Enter', shiftKey: true, ctrlKey: false, altKey: false, metaKey: false }) === '\n',
  'maps Shift+Enter to a terminal newline'
);
console.assert(
  terminalInputForKey({ type: 'keydown', key: 'Enter', shiftKey: false, ctrlKey: false, altKey: false, metaKey: false }) === null,
  'keeps Enter handled by xterm'
);
console.assert(shouldForwardImeText('，', 'insertText', false), 'forwards Chinese IME punctuation');
console.assert(!shouldForwardImeText('中', 'insertCompositionText', true), 'keeps composing text handled by xterm');
