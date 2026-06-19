# smartDoc

Personal document manager for Windows. Version **0.1.0**.

## 开发

依赖 Node.js ≥ 20、npm ≥ 10、Windows 10/11。

```bash
npm install
npm run dev          # 启动 Electron 开发模式
npm test             # Vitest watch
npm run test:run     # 单跑全部单测
npm run test:e2e     # Playwright 端到端（自动 build + 切换 better-sqlite3 ABI）
npm run typecheck    # 三套 tsconfig 类型检查
npm run build        # 打 main/preload/renderer 产物到 out/
```

> **better-sqlite3 双 ABI**：Vitest 使用宿主 Node ABI 的二进制，Playwright E2E 使用 Electron 嵌入 Node 的 ABI。`test:e2e` 链路会自动切换两种 ABI；如需手动切换：`npm run rebuild:electron` / `npm run rebuild:node`。

首次启动会弹窗要求选择仓库目录，所有导入的文件将复制到 `<仓库>/files/<uuid>/<原始文件名>`。
配置文件位于 `%APPDATA%/smartdoc/smartdoc-config.json`，日志位于 `%APPDATA%/smartdoc/logs/main.log`。

## 当前进度

- [x] Part 1：脚手架、主进程基础设施、最小占位 UI
- [x] Part 2：完整 UI（antd 布局、标签、搜索、详情抽屉、Playwright E2E）
- [ ] Part 3：electron-builder 打包 + electron-updater 自动更新
