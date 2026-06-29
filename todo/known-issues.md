# 待处理已知问题

## SettingsDialog `startupLayout` select onChange 忽略事件值

**位置**: `src/renderer/App.tsx` — SettingsDialog 组件

**问题描述**:
`<select>` 的 `onChange` 处理函数忽略了事件对象，硬编码为 `'grid-2x2'`：

```tsx
onChange={() => patch({ startupLayout: 'grid-2x2' })}
```

虽然目前只有 `grid-2x2` 一个选项，功能正常，但未来增加新布局（如 `grid-1x4`）时会变成静默 bug：用户选择其他布局后，值永远被重置为 `'grid-2x2'`。

**修复方式**:
1. 从 `../shared` 导入 `LayoutId` 类型
2. 将 onChange 改为 `(event) => patch({ startupLayout: event.target.value as LayoutId })`

**优先级**: 低（当前无影响，新增布局前修复即可）
