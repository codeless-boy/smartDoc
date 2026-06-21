# smartDoc — Windows 桌面文档管理软件 设计文档

> 日期: 2026-06-16 | 版本: 0.1.0 | 状态: 已确认

## 1. 概述

smartDoc 是一款 Windows 桌面端的个人文档管理软件。对文件进行分类、标签和搜索，不解析文件内容，文件的打开依赖本机已安装的第三方软件。

- **目标用户**: 个人用户
- **规模**: 几千到两万文件
- **技术栈**: Electron + React + TypeScript + SQLite (better-sqlite3)

---

## 2. 架构

```
┌──────────────────────────────────────────────────┐
│                   Electron App                    │
│                                                  │
│  ┌─────────────┐     ┌───────────────────────┐   │
│  │ Main Process │     │   Renderer Process     │   │
│  │  (Node.js)   │◄───►│   (React + TypeScript) │   │
│  │              │ IPC │                       │   │
│  │ • 文件导入   │     │ • UI 界面             │   │
│  │ • 文件仓库   │     │ • 标签聚合面板        │   │
│  │ • SQLite CRUD│     │ • 文档看板            │   │
│  │ • 搜索       │     │ • 搜索栏              │   │
│  └──────┬───────┘     └───────────────────────┘   │
│         │                                        │
│  ┌──────┴───────┐                                │
│  │   SQLite DB  │                                │
│  └──────────────┘                                │
└──────────────────────────────────────────────────┘
```

**Main Process 职责**: 管理 SQLite 数据库、文件导入（复制到仓库）、文件删除、通过 IPC 暴露 API 给 Renderer。

**Renderer Process 职责**: 纯 UI，不直接访问文件系统或数据库，通过 IPC 调用 Main Process 获取数据。

**文件仓库**: 用户指定一个仓库目录，导入的文件按 `repo/files/{uuid}/{原始文件名}` 存储 —— 每个文件独占一个 UUID 子目录，保留原始文件名（含扩展名）不变，方便用户在文件管理器中识别，也避免不同文件的同名冲突。

---

## 3. 数据模型

```sql
-- 文件表
CREATE TABLE files (
    id          TEXT PRIMARY KEY,          -- UUID
    name        TEXT NOT NULL,             -- 原始文件名（含扩展名）
    ext         TEXT NOT NULL,             -- 扩展名（小写）
    size        INTEGER NOT NULL,          -- 字节数
    storage_path TEXT NOT NULL,            -- 仓库中相对路径 files/{uuid}/{原始文件名}
    note        TEXT DEFAULT '',           -- 用户备注
    imported_at TEXT NOT NULL,             -- 导入时间 ISO8601
    updated_at  TEXT NOT NULL
);

-- 标签表
CREATE TABLE tags (
    id        TEXT PRIMARY KEY,            -- UUID
    name      TEXT NOT NULL UNIQUE,        -- 标签名
    color     TEXT DEFAULT '#6366f1',      -- 标签颜色
    created_at TEXT NOT NULL
);

-- 文件-标签关联表
CREATE TABLE file_tags (
    file_id TEXT REFERENCES files(id) ON DELETE CASCADE,
    tag_id  TEXT REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (file_id, tag_id)
);

-- 打开记录表
CREATE TABLE file_opens (
    id        TEXT PRIMARY KEY,
    file_id   TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    opened_at TEXT NOT NULL              -- ISO8601
);

CREATE INDEX idx_file_opens_file ON file_opens(file_id);
CREATE INDEX idx_file_opens_time ON file_opens(opened_at);
```

---

## 4. 界面布局

```
┌────────────────────────────────────────────────────┐
│  顶部: 🔍 搜索栏 (debounce 300ms)          [导入文件] │
├──────────┬─────────────────────────┬───────────────┤
│ 左侧     │ 中间                    │ 右侧          │
│ 标签聚合  │ 文档主看板               │ 详情侧栏      │
│ 220px    │                         │ 220px         │
│          │                         │ (单击文件时    │
│ ⚡快捷筛选│ 大行距紧凑列表            │  弹出)        │
│ • 最近   │ ┌──────────────────┐    │               │
│ • 未标签 │ │📄 文件名  标签chip│    │ 标签编辑      │
│ • 常用   │ │📊 文件名  标签chip│    │ 备注编辑      │
│          │ │🖼️ 文件名  标签chip│    │ 文件信息      │
│ 📑类型   │ └──────────────────┘    │ 打开/定位     │
│ • PDF    │                         │               │
│ • Excel  │ 交互:                   │               │
│ • Word   │ 单击→弹出右侧详情        │               │
│ • 图片   │ 双击→系统默认程序打开     │               │
│ • 其他   │ 拖拽→导入文件            │               │
│          │                         │               │
│ 🏷️标签云 │                         │               │
│ 标签1 标签2│                         │               │
│ (多选)   │                         │               │
└──────────┴─────────────────────────┴───────────────┘
```

### 左侧面板

| 模块 | 数据来源 |
|------|---------|
| 最近添加 | `files ORDER BY imported_at DESC` |
| 未打标签 | `files LEFT JOIN file_tags WHERE file_id IS NULL` |
| 常用文档 | `files JOIN file_opens GROUP BY files.id ORDER BY COUNT(*) DESC LIMIT 20` |
| 文件类型 | `SELECT ext, COUNT(*) FROM files GROUP BY ext` |
| 标签云 | 所有 tags，支持 Ctrl+多选，交集筛选 |

### 中间看板

- 仅列表模式（大行距紧凑列表）
- 每行: 文件类型图标 + 文件名 + 大小 + 日期 + 彩色标签 chips
- 每隔一行交替浅色背景便于阅读
- 左上角显示当前筛选条件（可点击 ✕ 移除）和结果数量

### 右侧详情

- 仅在单击文件后出现（非始终可见）
- 内容：标签编辑（已有标签可 ✕ 移除、+ 添加新标签）、备注编辑、文件基本信息（大小、导入时间、路径、MD5）、"打开文件"按钮

---

## 5. IPC 通信设计

Main Process 通过 IPC 暴露以下接口，请求-响应模式：

```
文件操作:
  file:import     (paths: string[]) → FileInfo[]
  file:delete     (ids: string[])    → void
  file:update     (id, fields)       → FileInfo
  file:list       (query)            → FileInfo[]
  file:open       (id)               → void  (shell.openPath，系统默认程序打开)

标签操作:
  tag:list        ()                 → TagInfo[]
  tag:create      (name, color)      → TagInfo
  tag:delete      (id)               → void
  tag:update      (id, fields)       → TagInfo
  tag:setOnFile   (fileId, tagIds[]) → void

搜索:
  search:files    (keyword, filters) → FileInfo[]
  search:suggest  (prefix)           → Suggestion[]
```

---

## 6. 文件导入流程

1. 用户通过拖拽文件到窗口或点击"导入文件"按钮触发导入
2. Main Process 逐文件处理：
   - 重复检测：按**文件名**（`files.name`，含扩展名，大小写不敏感）比对已有文件
   - 不重复：生成 UUID → 创建目录 `repo/files/{uuid}/` → 以**原始文件名**复制到该目录 → 写入 files 表（`name` 与磁盘上文件名保持一致）
   - 重复：弹窗询问 — 跳过 / 覆盖 / 保留两份
     - **跳过**：忽略本次导入，不动数据库与磁盘
     - **覆盖**：复用原记录的 UUID 与目录，重新写入文件内容，更新 `size` 与 `updated_at`，标签/备注保留
     - **保留两份**：生成新 UUID，文件名加序号 `xxx (2).ext`（若已存在 `(2)` 则递增到 `(3)` 直至唯一），写入新记录
3. 拖拽中显示半透明遮罩提示"松开以导入"
4. 导入完成：右下角 Toast 提示结果，如有重复跳过告知数量
5. 超大文件（>500MB）：弹窗确认后显示进度条

> **设计说明**：之所以用 `{uuid}/` 子目录隔离而不是扁平拼接 `{uuid}{ext}`，是为了在保留原始文件名的同时彻底回避多文件重名冲突——用户在资源管理器（"定位文件"按钮）中看到的就是熟悉的原始名，第三方程序打开时也会以原始名出现在标题栏与最近列表中。
>
> **重复检测仅按文件名**：不比对文件大小或哈希。理由是用户更可能基于"我已经有这个文件了吗"这种语义判断，文件名是最直观的标识；同名但内容不同的情形交由"覆盖 / 保留两份"显式选择，避免静默放过。

---

## 7. 搜索设计

- 输入 300ms debounce 后触发
- 并行匹配：文件名 LIKE、标签名 LIKE（通过关联表找到文件）、备注 LIKE
- 结果合并去重，按相关度排序：
  1. 文件名精确匹配
  2. 文件名包含关键词
  3. 标签名匹配
  4. 备注匹配
- 搜索结果直接替换中间看板列表，左侧标签云可继续叠加筛选

---

## 8. 错误处理与边界情况

| 场景 | 处理方式 |
|------|---------|
| 导入时磁盘空间不足 | 弹出警告，已复制文件回滚删除，显示剩余空间 |
| 仓库文件被外部删除 | 列表中灰色标记"文件丢失"，双击提示无法打开，提供"移除记录"按钮 |
| SQLite 数据库损坏 | 启动时自动尝试 `.recover`，失败则提示重建索引 |
| 超大文件导入（>500MB） | 弹窗确认后显示进度条 |
| 文件类型未关联程序 | 调用系统"打开方式"对话框 |
| 并发写入冲突 | better-sqlite3 同步单线程，天然无冲突 |

---

## 9. 技术选型理由

| 技术 | 理由 |
|------|------|
| Electron | 开发效率高，项目已是 Node.js 环境，UI 表现力强 |
| React + TypeScript | 类型安全，组件化开发，生态成熟 |
| Ant Design | 社区成熟的 React 组件库，开箱即用的 Tag、Table、Input.Search、Drawer、Layout、Tooltip 等组件，中文文档完善，与需求高度匹配 |
| @ant-design/icons | Ant Design 官方图标库，提供 2000+ 图标，与 antd 组件无缝集成，覆盖文件类型图标、操作按钮图标等需求 |
| better-sqlite3 | 同步 API 避免并发问题，性能好，无需额外服务进程 |
| SQLite | 轻量嵌入式，无需安装配置，适合单机桌面应用 |
| electron-vite | 项目脚手架与构建工具，原生支持 Electron 三进程（main / preload / renderer），HMR 快速、TS/React 开箱即用 |
| electron-store | 持久化用户配置（仓库路径、窗口尺寸、最近筛选等），基于 JSON 文件，Main/Renderer 通用 |
| electron-log | 统一日志记录（main / renderer / IPC 异常），自动按文件大小切分、可写入用户目录 |
| electron-builder | 打包 Windows 安装包（NSIS），生成 latest.yml 供自动更新使用 |
| electron-updater | 配合 electron-builder 实现增量自动更新，支持 GitHub Releases / 自建静态服务器 |
| Vitest | 单元测试框架，测试 Main 进程的纯逻辑代码（数据库 CRUD、搜索排序、文件去重等），与 Vite 生态一致，启动快 |
| Playwright | 端到端测试框架，使用 `_electron.launch()` 驱动打包前的 Electron 应用，覆盖导入、搜索、标签编辑等核心流程 |

### Ant Design 组件映射

| UI 模块 | 对应 antd 组件 |
|---------|---------------|
| 搜索栏 | `Input.Search` + debounce |
| 标签云 | `Tag`（多色、可点击、可关闭） |
| 文件列表 | `List` 或 `Table`（大行距、自定义渲染） |
| 左侧面板 | `Menu` / 自定义 `Collapse` + `Tag` |
| 右侧详情 | `Drawer`（从右侧滑出） |
| 导入反馈 | `message` / `notification` |
| 进度条 | `Progress` |
| 布局骨架 | `Layout`（Sider + Content） |
| 文件类型图标 | `@ant-design/icons`（FilePdfOutlined、FileExcelOutlined、FileWordOutlined、FileImageOutlined 等） |
| 操作按钮图标 | `@ant-design/icons`（DeleteOutlined、EditOutlined、FolderOpenOutlined 等） |

---

## 10. 工程化与工具链

### 10.1 项目脚手架（electron-vite）

使用 `electron-vite` 初始化项目，标准目录结构：

```
smartDoc/
├── electron.vite.config.ts        # main / preload / renderer 三套构建配置
├── src/
│   ├── main/                      # Main 进程：IPC、SQLite、文件仓库
│   │   ├── index.ts
│   │   ├── database.ts
│   │   ├── file-repo.ts
│   │   ├── ipc/
│   │   ├── config.ts              # electron-store 封装
│   │   ├── logger.ts              # electron-log 封装
│   │   └── updater.ts             # electron-updater 封装
│   ├── preload/                   # contextBridge，暴露安全 API
│   │   └── index.ts
│   └── renderer/                  # React + antd
│       ├── index.html
│       └── src/
├── tests/
│   ├── unit/                      # Vitest 单元测试
│   └── e2e/                       # Playwright E2E 测试
├── electron-builder.yml           # 打包配置
├── vitest.config.ts
└── playwright.config.ts
```

- 启动：`npm run dev`（HMR；renderer 用 Vite，main/preload 用 esbuild）
- 构建：`npm run build`（产物输出到 `out/`，再交给 electron-builder）

### 10.2 配置管理（electron-store）

- 仅在 Main 进程实例化一个 `Store` 单例，Renderer 通过 IPC（`config:get` / `config:set`）读写
- 持久化项：
  - `repoPath`：用户仓库根目录（首次启动时引导选择）
  - `windowBounds`：窗口位置与尺寸
  - `theme`：明暗主题
  - `lastFilters`：上次使用的筛选状态（可选）
  - `updater.channel`：更新渠道（stable / beta）
- 配置使用 JSON Schema 校验，旧版本字段通过 `migrations` 字段平滑升级

### 10.3 日志（electron-log）

- Main 进程在入口处接管 `console`，并捕获 `uncaughtException` / `unhandledRejection`
- Renderer 通过 `electron-log/renderer` 透传到 Main 写文件，统一时间格式
- 日志策略：
  - 文件位置：`%APPDATA%/smartDoc/logs/main.log`、`renderer.log`
  - 单文件上限 5MB，自动滚动保留最近 5 个
  - 级别：开发 `debug`、生产 `info`
- IPC 调用包一层中间件：进入打印参数、出错打印堆栈，方便排查

### 10.4 打包与自动更新（electron-builder + electron-updater）

**electron-builder 配置（`electron-builder.yml`）要点：**
- `appId: com.smartdoc.app`、`productName: smartDoc`
- target: `nsis`（Windows 安装包，支持 perMachine 与 perUser）
- `asar: true`，`asarUnpack` 包含 `better-sqlite3` 原生模块
- `publish` 配置 `generic` 或 `github` provider，发布时同时输出 `latest.yml`

**electron-updater 流程：**
1. 应用启动 5 秒后调用 `autoUpdater.checkForUpdates()`
2. 发现新版本 → 后台静默下载（默认行为）
3. 下载完成 → `notification` 提示用户"新版本已就绪，重启即可更新"
4. 用户确认 → `autoUpdater.quitAndInstall()`
5. 全程通过 electron-log 记录 `update-available` / `download-progress` / `error` 事件
6. 更新失败时降级：仅日志记录，不打扰用户，下次启动重试

### 10.5 测试策略

**Vitest（单元测试）—— 覆盖 Main 进程纯逻辑：**
- `database.test.ts`：建表、CRUD、外键级联删除
- `file-repo.test.ts`：UUID 命名、重复检测（name+size）、回滚
- `search.test.ts`：搜索排序优先级、关键词分词
- `tag.test.ts`：标签去重、文件-标签关联
- 通过 `better-sqlite3` 在内存模式 (`:memory:`) 跑测试，零 IO 开销
- 命令：`npm test`（watch）/ `npm run test:run`（CI）

**Playwright（E2E 测试）—— 真实驱动 Electron：**
- 用 `_electron.launch({ args: ['./out/main/index.js'] })` 启动应用
- 每个测试前清空临时仓库目录与临时 SQLite，保证可重复
- 关键用例：
  - 首次启动 → 引导选择仓库目录
  - 拖拽导入文件 → 列表出现该文件
  - 添加标签 → 左侧标签云出现 → 点击筛选生效
  - 搜索关键词 → 结果按相关度排序
  - 双击文件 → 调用系统默认程序（mock `shell.openPath`）
- 命令：`npm run test:e2e`，CI 中运行 headed 模式截图归档

### 10.6 脚本约定（package.json）

```jsonc
{
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "package": "electron-builder --win",
    "publish": "electron-builder --win --publish always",
    "test": "vitest",
    "test:run": "vitest run",
    "test:e2e": "playwright test",
    "lint": "eslint . --ext .ts,.tsx",
    "typecheck": "tsc --noEmit"
  }
}
```


