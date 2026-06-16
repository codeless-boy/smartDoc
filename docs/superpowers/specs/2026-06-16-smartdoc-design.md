# smartDoc — Windows 桌面文档管理软件 设计文档

> 日期: 2026-06-16 | 状态: 已确认

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

**文件仓库**: 用户指定一个仓库目录，导入的文件按 `repo/files/{uuid}{ext}` 扁平存储。

---

## 3. 数据模型

```sql
-- 文件表
CREATE TABLE files (
    id          TEXT PRIMARY KEY,          -- UUID
    name        TEXT NOT NULL,             -- 原始文件名（含扩展名）
    ext         TEXT NOT NULL,             -- 扩展名（小写）
    size        INTEGER NOT NULL,          -- 字节数
    storage_path TEXT NOT NULL,            -- 仓库中相对路径 files/{uuid}.ext
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
- 内容：标签编辑（已有标签可 ✕ 移除、+ 添加新标签）、备注编辑、文件基本信息（大小、导入时间、路径、MD5）、"打开文件"和"定位文件"按钮

---

## 5. IPC 通信设计

Main Process 通过 IPC 暴露以下接口，请求-响应模式：

```
文件操作:
  file:import     (paths: string[]) → FileInfo[]
  file:delete     (ids: string[])    → void
  file:update     (id, fields)       → FileInfo
  file:list       (query)            → FileInfo[]
  file:open       (id)               → void  (shell.openPath)
  file:showInDir  (id)               → void  (shell.showItemInFolder)

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
   - 重复检测：按 (name + size) 比对已有文件
   - 不重复：生成 UUID → 复制到 `repo/files/{uuid}.ext` → 写入 files 表
   - 重复：弹窗询问 — 跳过 / 覆盖 / 保留两份（文件名加序号）
3. 拖拽中显示半透明遮罩提示"松开以导入"
4. 导入完成：右下角 Toast 提示结果，如有重复跳过告知数量
5. 超大文件（>500MB）：弹窗确认后显示进度条

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
| better-sqlite3 | 同步 API 避免并发问题，性能好，无需额外服务进程 |
| SQLite | 轻量嵌入式，无需安装配置，适合单机桌面应用 |

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
