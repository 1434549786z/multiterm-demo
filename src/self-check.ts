import { cloneConfig, normalizeConfig, sameConfig } from './shared';

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
