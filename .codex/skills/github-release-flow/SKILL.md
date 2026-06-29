---
name: github-release-flow
description: Standard GitHub submission and release workflow for this project. Use when publishing this Electron demo to GitHub, pushing commits, building the Windows exe, or creating a GitHub Release with the installer artifact.
---

# GitHub Release Flow

Use this workflow when the user asks to submit this project to GitHub or publish a Release.

## Rules

- Treat the project as a Demo unless the user says otherwise.
- Before pushing, run the smallest checks that prove the commit is usable:
  - `npm run test`
  - `npm run dist:win`
- Do not commit generated folders or logs: `node_modules/`, `out/`, `dist/`, `*.log`, `*.err`.
- Upload the installer from `dist/MultiTerm Setup <version>.exe` as the Release asset.
- If a tag or Release already exists, do not overwrite it silently. Use a new version or ask before deleting.

## Commands

```powershell
git -c safe.directory='F:/work/git/多窗口终端' status --short --branch
npm run test
npm run dist:win
git -c safe.directory='F:/work/git/多窗口终端' add -A
git -c safe.directory='F:/work/git/多窗口终端' commit -m "chore: release v<version>"
git -c safe.directory='F:/work/git/多窗口终端' push
gh release create v<version> "dist/MultiTerm Setup <version>.exe" --title "MultiTerm v<version> Demo" --notes "Demo 版本，包含 Windows 安装包。"
```

## Verify

```powershell
gh release view v<version> --json url,tagName,assets
```
