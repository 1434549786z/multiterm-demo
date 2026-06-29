import { normalizeConfig } from './shared';

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
