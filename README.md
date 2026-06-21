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

## 打包与发布

```bash
npm run package:dir   # 仅解包到 release/<version>/win-unpacked/，快速冒烟
npm run package       # 产出 NSIS 安装包 release/<version>/smartDoc-<version>-setup.exe
npm run publish       # 同 package，并上传到 GitHub Release（需 GH_TOKEN）
```

`scripts/package.mjs` 会自动注入 npmmirror 镜像（ELECTRON_MIRROR / ELECTRON_BUILDER_BINARIES_MIRROR）并预解压 winCodeSign 缓存（绕过本机无符号链接权限导致的 7za 解压失败），无需手动设置环境变量。

> **GitHub owner**：`electron-builder.yml` 的 `publish.owner` 与 `package.json` 的 `repository.url` 指向 `codeless-boy/smartDoc`。如迁移仓库请同步更新这两处。

### 本地自动更新冒烟

在本地用静态服务器模拟 GitHub Release，验证 electron-updater 全流程（无需真实发布）：

1. 打 0.1.0 安装包并安装：
   ```bash
   npm run package
   # 运行 release/0.1.0/smartDoc-0.1.0-setup.exe 走完安装向导
   ```

2. 临时改发布渠道为本地服务器。新建 `electron-builder.local.yml`：
   ```yaml
   publish:
     provider: generic
     url: http://127.0.0.1:18080/
   ```
   打包时用 `-c` 合并覆盖：编辑 `scripts/package.mjs` 临时追加 `--config electron-builder.local.yml`，或直接编辑 `electron-builder.yml` 的 publish 段。

3. 升版本号到 0.1.1 并重新打包：
   ```bash
   # package.json version 改为 0.1.1
   npm run package
   ```
   产物 `release/0.1.1/` 内含 `smartDoc-0.1.1-setup.exe`、`latest.yml`、`*.blockmap`。

4. 启动本地静态服务器托管 0.1.1：
   ```bash
   npx http-server release/0.1.1 -p 18080 --cors
   ```

5. 启动已安装的 0.1.0（开始菜单 / 桌面快捷方式）。应用启动 5 秒后自动检查更新，请求 `http://127.0.0.1:18080/latest.yml`，发现 0.1.1 后后台下载。

6. 下载完成后右下角弹出"新版本已就绪"通知，点击"立即重启"即完成更新。重启后版本号变为 0.1.1。

7. 测试完毕后把 `package.json` 版本号改回 0.1.0，删除 `electron-builder.local.yml`。

> 日志位于 `%APPDATA%/smartDoc/logs/main.log`，可看到 `updater state` 的 phase 切换（checking → available → downloading → downloaded）。

### 发布新版本（CI）

推送 `v*` 标签即触发 `.github/workflows/release.yml`：GitHub Actions 在 windows-latest 上 `npm ci` → typecheck → 单测 → `npm run publish`（electron-builder 用 `GH_TOKEN` 创建/更新 GitHub Release 并上传 setup.exe + latest.yml + blockmap）。

```bash
# 1. 升版本号
#    package.json version → 0.1.1
git commit -am "chore: bump 0.1.1"
# 2. 打标签并推送
git tag v0.1.1
git push origin main --tags
# 3. CI 构建并发布；已安装的旧版本启动 5 秒后自动检测到新版本
```

> CI 环境网络通畅，`scripts/package.mjs` 注入的 npmmirror 镜像与 winCodeSign 预解压在 CI 上是冗余但无害的（确保本地与 CI 行为一致）。

## 当前进度

- [x] Part 1：脚手架、主进程基础设施、最小占位 UI
- [x] Part 2：完整 UI（antd 布局、标签、搜索、详情抽屉、Playwright E2E）
- [x] Part 3：electron-builder 打包 + electron-updater 自动更新
