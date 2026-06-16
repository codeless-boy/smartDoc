# smartDoc 实施计划 — 第二部分：React + Ant Design 完整前端

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 基于设计文档的技术选型和布局要求，用 React + TypeScript + Ant Design 替换第一部分的简略前端，实现完整 UI。

**Architecture:** 复用第一部分全部后台代码（main / preload / file-repo / database / ipc-handlers 不变），新增 `src/renderer-react/` 目录作为 React 前端，通过 Vite 构建，开发时 Electron 加载 Vite dev server。

**Tech Stack:** React 19, TypeScript 5, Vite 6, Ant Design 5, @ant-design/icons 5

**依赖关系:** 必须先完成第一部分（后台功能已验证通过），本部分只替换前端。

---

## 文件结构（新增/修改）

```
smartDoc/
├── package.json                 # 新增 React/Vite/AntD 依赖和 dev 脚本
├── src/
│   ├── main/
│   │   └── main.js              # 修改：dev 模式加载 Vite dev server
│   ├── preload/                 # 不变
│   └── renderer-react/          # 新建 React 项目
│       ├── index.html
│       ├── vite.config.ts
│       ├── tsconfig.json
│       ├── tsconfig.node.json
│       └── src/
│           ├── main.tsx
│           ├── index.css
│           ├── App.tsx
│           ├── api/
│           │   └── ipc.ts       # IPC 调用封装（类型安全）
│           ├── components/
│           │   ├── SearchBar.tsx    # 顶部搜索栏
│           │   ├── TagPanel.tsx     # 左侧标签聚合面板
│           │   ├── FileList.tsx     # 中间文档主看板
│           │   ├── FileDetail.tsx   # 右侧详情 Drawer
│           │   └── ImportZone.tsx   # 拖拽导入区域
│           └── types/
│               └── index.ts     # TypeScript 类型定义
```

---

### Task 11: React 项目搭建

**Files:**
- Modify: `package.json`
- Create: `src/renderer-react/index.html`, `src/renderer-react/vite.config.ts`, `src/renderer-react/tsconfig.json`, `src/renderer-react/tsconfig.node.json`

- [ ] **Step 1: 更新 package.json 添加 React 依赖**

将 `package.json` 更新为（在 Part 1 基础上新增 devDependencies 和 dependencies）：

```json
{
  "name": "smartDoc",
  "version": "1.0.0",
  "description": "Windows 桌面文档管理软件",
  "main": "src/main/main.js",
  "scripts": {
    "start": "electron .",
    "dev": "concurrently \"cd src/renderer-react && npx vite --port 5173\" \"wait-on http://localhost:5173 && electron . --dev\"",
    "build": "cd src/renderer-react && npx vite build",
    "postinstall": "electron-rebuild -f -w better-sqlite3"
  },
  "private": true,
  "devDependencies": {
    "@electron/rebuild": "^3.6.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "concurrently": "^9.0.0",
    "electron": "^33.0.0",
    "typescript": "^5.6.0",
    "vite": "^6.0.0",
    "wait-on": "^8.0.0"
  },
  "dependencies": {
    "@ant-design/icons": "^5.5.0",
    "antd": "^5.22.0",
    "better-sqlite3": "^11.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
```

- [ ] **Step 2: 安装新依赖**

```bash
cd E:\code\smartDoc && npm install
```

- [ ] **Step 3: 创建 index.html**

```html
<!-- src/renderer-react/index.html -->
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>smartDoc</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

- [ ] **Step 4: 创建 vite.config.ts**

```ts
// src/renderer-react/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
```

- [ ] **Step 5: 创建 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

- [ ] **Step 6: 创建 tsconfig.node.json**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 7: 更新 main.js 支持 dev 模式**

修改 `src/main/main.js` 中 `createWindow` 函数：

```js
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const isDev = process.argv.includes('--dev');
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'renderer-react', 'dist', 'index.html'));
  }
}
```

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src/renderer-react/ src/main/main.js
git commit -m "chore: scaffold React + Vite + TypeScript + Ant Design project"
```

---

### Task 12: TypeScript 类型定义

**Files:**
- Create: `src/renderer-react/src/types/index.ts`

- [ ] **Step 1: 定义类型**

```ts
// src/renderer-react/src/types/index.ts

export interface FileInfo {
  id: string;
  name: string;
  ext: string;
  size: number;
  storage_path: string;
  note: string;
  imported_at: string;
  updated_at: string;
  tags: TagInfo[];
  openCount?: number;
}

export interface TagInfo {
  id: string;
  name: string;
  color: string;
  created_at?: string;
  file_count?: number;
}

export interface FileDetail extends FileInfo {
  openCount: number;
}

export interface ImportResult {
  path: string;
  status: 'imported' | 'duplicate' | 'error';
  id?: string;
  name?: string;
  size?: number;
  ext?: string;
  existingId?: string;
  error?: string;
}

export interface TypeCounts {
  pdf: number;
  word: number;
  excel: number;
  image: number;
  other: number;
}

export interface PanelResult {
  files: FileInfo[];
  total: number;
}

export interface SearchSuggestion {
  type: 'file' | 'tag';
  text: string;
}

export interface FileListQuery {
  ext?: string;
  exts?: string[];
  tagIds?: string[];
  untagged?: boolean;
  ids?: string[];
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
  limit?: number;
}

// Window API 类型声明
declare global {
  interface Window {
    api: {
      file: {
        import: (paths: string[]) => Promise<ImportResult[]>;
        delete: (ids: string[]) => Promise<void>;
        update: (id: string, fields: { note?: string }) => Promise<FileInfo>;
        list: (query?: FileListQuery) => Promise<FileInfo[]>;
        open: (id: string) => Promise<void>;
        showInDir: (id: string) => Promise<void>;
        detail: (id: string) => Promise<FileDetail>;
      };
      tag: {
        list: () => Promise<TagInfo[]>;
        create: (name: string, color?: string) => Promise<TagInfo>;
        delete: (id: string) => Promise<void>;
        update: (id: string, fields: { name?: string; color?: string }) => Promise<TagInfo>;
        setOnFile: (fileId: string, tagIds: string[]) => Promise<void>;
      };
      search: {
        files: (keyword: string, filters?: Record<string, unknown>) => Promise<FileInfo[]>;
        suggest: (prefix: string) => Promise<SearchSuggestion[]>;
      };
      panel: {
        recent: (limit?: number) => Promise<PanelResult>;
        untagged: () => Promise<PanelResult>;
        frequent: () => Promise<PanelResult>;
        typeCounts: () => Promise<TypeCounts>;
        tagsWithCount: () => Promise<TagInfo[]>;
      };
      dialog: {
        openFiles: () => Promise<string[]>;
      };
    };
  }
}

export {};
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer-react/src/types/index.ts
git commit -m "feat: add TypeScript type definitions and window.api declaration"
```

---

### Task 13: IPC 调用封装、入口与 App 骨架

**Files:**
- Create: `src/renderer-react/src/api/ipc.ts`, `src/renderer-react/src/main.tsx`, `src/renderer-react/src/index.css`, `src/renderer-react/src/App.tsx`

- [ ] **Step 1: API 封装层**

```ts
// src/renderer-react/src/api/ipc.ts
import type { FileInfo, FileDetail, TagInfo, ImportResult, TypeCounts, PanelResult, SearchSuggestion, FileListQuery } from '@/types';

export const fileApi = {
  import: (paths: string[]): Promise<ImportResult[]> => window.api.file.import(paths),
  delete: (ids: string[]): Promise<void> => window.api.file.delete(ids),
  update: (id: string, fields: { note?: string }): Promise<FileInfo> => window.api.file.update(id, fields),
  list: (query?: FileListQuery): Promise<FileInfo[]> => window.api.file.list(query),
  open: (id: string): Promise<void> => window.api.file.open(id),
  showInDir: (id: string): Promise<void> => window.api.file.showInDir(id),
  detail: (id: string): Promise<FileDetail> => window.api.file.detail(id),
};

export const tagApi = {
  list: (): Promise<TagInfo[]> => window.api.tag.list(),
  create: (name: string, color?: string): Promise<TagInfo> => window.api.tag.create(name, color),
  delete: (id: string): Promise<void> => window.api.tag.delete(id),
  update: (id: string, fields: { name?: string; color?: string }): Promise<TagInfo> => window.api.tag.update(id, fields),
  setOnFile: (fileId: string, tagIds: string[]): Promise<void> => window.api.tag.setOnFile(fileId, tagIds),
};

export const searchApi = {
  files: (keyword: string): Promise<FileInfo[]> => window.api.search.files(keyword),
};

export const panelApi = {
  recent: (limit = 50): Promise<PanelResult> => window.api.panel.recent(limit),
  untagged: (): Promise<PanelResult> => window.api.panel.untagged(),
  frequent: (): Promise<PanelResult> => window.api.panel.frequent(),
  typeCounts: (): Promise<TypeCounts> => window.api.panel.typeCounts(),
  tagsWithCount: (): Promise<TagInfo[]> => window.api.panel.tagsWithCount(),
};

export const dialogApi = {
  openFiles: (): Promise<string[]> => window.api.dialog.openFiles(),
};
```

- [ ] **Step 2: main.tsx 入口**

```tsx
// src/renderer-react/src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#6366f1',
          borderRadius: 6,
        },
      }}
    >
      <App />
    </ConfigProvider>
  </React.StrictMode>,
);
```

- [ ] **Step 3: 基础全局样式**

```css
/* src/renderer-react/src/index.css */
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Microsoft YaHei', sans-serif; }
#root { height: 100vh; }
```

- [ ] **Step 4: App.tsx 骨架**

```tsx
// src/renderer-react/src/App.tsx
import { useState, useCallback, useEffect } from 'react';
import { Layout, message } from 'antd';
import type { FileInfo, TagInfo, TypeCounts } from '@/types';
import SearchBar from '@/components/SearchBar';
import TagPanel from '@/components/TagPanel';
import FileList from '@/components/FileList';
import FileDetail from '@/components/FileDetail';
import ImportZone from '@/components/ImportZone';
import { fileApi, searchApi, panelApi, dialogApi } from '@/api/ipc';

const { Header, Sider, Content } = Layout;

type FilterType = 'all' | 'recent' | 'untagged' | 'frequent' | 'type';

export default function App() {
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [tags, setTags] = useState<TagInfo[]>([]);
  const [typeCounts, setTypeCounts] = useState<TypeCounts>({ pdf: 0, word: 0, excel: 0, image: 0, other: 0 });
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [currentFilter, setCurrentFilter] = useState<FilterType>('all');
  const [currentTypeExts, setCurrentTypeExts] = useState<string[] | null>(null);
  const [currentTypeKey, setCurrentTypeKey] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const refreshFiles = useCallback(async () => {
    let result: FileInfo[];
    if (searchKeyword) {
      result = await searchApi.files(searchKeyword);
    } else if (selectedTagIds.length > 0) {
      result = await fileApi.list({ tagIds: selectedTagIds });
    } else if (currentFilter === 'recent') {
      result = (await panelApi.recent(50)).files;
    } else if (currentFilter === 'untagged') {
      result = (await panelApi.untagged()).files;
    } else if (currentFilter === 'frequent') {
      result = (await panelApi.frequent()).files;
    } else if (currentFilter === 'type' && currentTypeExts) {
      result = await fileApi.list({ exts: currentTypeExts });
    } else {
      result = await fileApi.list({});
    }
    setFiles(result);
  }, [searchKeyword, selectedTagIds, currentFilter, currentTypeExts]);

  const refreshAll = useCallback(async () => {
    await refreshFiles();
    const [tagsData, counts] = await Promise.all([
      panelApi.tagsWithCount(),
      panelApi.typeCounts(),
    ]);
    setTags(tagsData);
    setTypeCounts(counts);
  }, [refreshFiles]);

  useEffect(() => { refreshAll(); }, [refreshAll]);

  const handleFileClick = (id: string) => {
    setSelectedFileId(id);
    setDrawerOpen(true);
  };

  const handleFileDoubleClick = async (id: string) => {
    try {
      await fileApi.open(id);
      refreshAll();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '打开失败';
      if (msg.includes('FILE_MISSING')) {
        message.warning('文件丢失，已被外部删除');
      } else {
        message.error('打开失败: ' + msg);
      }
    }
  };

  const handleImport = async (paths: string[]) => {
    if (!paths.length) return;
    const results = await fileApi.import(paths);
    const imported = results.filter(r => r.status === 'imported');
    const dupes = results.filter(r => r.status === 'duplicate');
    const errors = results.filter(r => r.status === 'error');
    let msg = `成功导入 ${imported.length} 个文件`;
    if (dupes.length) msg += `，${dupes.length} 个重复已跳过`;
    if (errors.length) msg += `，${errors.length} 个失败`;
    message.success(msg);
    refreshAll();
  };

  return (
    <ImportZone onImport={handleImport}>
      <Layout style={{ height: '100vh' }}>
        <Header style={{ background: '#fff', padding: '0 16px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid #f0f0f0' }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#6366f1', whiteSpace: 'nowrap' }}>smartDoc</div>
          <SearchBar
            onSearch={(kw) => setSearchKeyword(kw)}
            fileCount={files.length}
            onImport={() => dialogApi.openFiles().then(handleImport)}
          />
        </Header>
        <Layout>
          <Sider width={240} style={{ background: '#fff', borderRight: '1px solid #f0f0f0', overflow: 'auto' }}>
            <TagPanel
              tags={tags}
              typeCounts={typeCounts}
              selectedTagIds={selectedTagIds}
              currentFilter={currentFilter}
              currentTypeFilter={currentTypeKey}
              onSelectTags={(ids) => { setSelectedTagIds(ids); setCurrentFilter('all'); setSearchKeyword(''); }}
              onSelectFilter={(filter) => { setCurrentFilter(filter); setSelectedTagIds([]); setSearchKeyword(''); }}
              onSelectType={(typeKey, exts) => { setCurrentTypeKey(typeKey); setCurrentTypeExts(exts); setCurrentFilter('type'); setSelectedTagIds([]); setSearchKeyword(''); }}
              onTagCreated={refreshAll}
            />
          </Sider>
          <Content style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <FileList
              files={files}
              selectedFileId={selectedFileId}
              onFileClick={handleFileClick}
              onFileDoubleClick={handleFileDoubleClick}
              selectedTagIds={selectedTagIds}
              onRemoveTagFilter={(tagId) => setSelectedTagIds(prev => prev.filter(id => id !== tagId))}
            />
          </Content>
        </Layout>
        <FileDetail
          fileId={selectedFileId}
          open={drawerOpen}
          allTags={tags}
          onClose={() => { setDrawerOpen(false); setSelectedFileId(null); }}
          onUpdated={refreshAll}
        />
      </Layout>
    </ImportZone>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/renderer-react/src/api/ src/renderer-react/src/main.tsx src/renderer-react/src/App.tsx src/renderer-react/src/index.css
git commit -m "feat: add React app skeleton, IPC API layer, and dev mode support"
```

---

### Task 14: SearchBar 组件

**Files:**
- Create: `src/renderer-react/src/components/SearchBar.tsx`

- [ ] **Step 1: 实现 SearchBar**

```tsx
// src/renderer-react/src/components/SearchBar.tsx
import { Input, Button } from 'antd';
import { SearchOutlined, PlusOutlined } from '@ant-design/icons';
import { useState, useEffect, useRef } from 'react';

interface SearchBarProps {
  onSearch: (keyword: string) => void;
  fileCount: number;
  onImport: () => void;
}

export default function SearchBar({ onSearch, fileCount, onImport }: SearchBarProps) {
  const [value, setValue] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onSearch(value.trim());
    }, 300);
    return () => clearTimeout(timerRef.current);
  }, [value, onSearch]);

  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 12 }}>
      <Input
        prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
        placeholder="搜索文件名、标签..."
        value={value}
        onChange={e => setValue(e.target.value)}
        allowClear
        style={{ flex: 1 }}
      />
      <span style={{ fontSize: 12, color: '#999', whiteSpace: 'nowrap' }}>
        共 {fileCount} 个文件
      </span>
      <Button type="primary" icon={<PlusOutlined />} onClick={onImport}>
        导入文件
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer-react/src/components/SearchBar.tsx
git commit -m "feat: add SearchBar component with debounce"
```

---

### Task 15: TagPanel 组件

**Files:**
- Create: `src/renderer-react/src/components/TagPanel.tsx`

- [ ] **Step 1: 实现左侧标签聚合面板**

```tsx
// src/renderer-react/src/components/TagPanel.tsx
import { useState } from 'react';
import { Input, Button, Tag, Divider, ColorPicker, message } from 'antd';
import {
  ClockCircleOutlined, TagsOutlined, StarOutlined,
  FilePdfOutlined, FileExcelOutlined, FileWordOutlined,
  FileImageOutlined, FileOutlined, PlusOutlined,
} from '@ant-design/icons';
import type { TagInfo, TypeCounts } from '@/types';
import { tagApi } from '@/api/ipc';

interface TagPanelProps {
  tags: TagInfo[];
  typeCounts: TypeCounts;
  selectedTagIds: string[];
  currentFilter: string;
  currentTypeFilter: string | null;
  onSelectTags: (ids: string[]) => void;
  onSelectFilter: (filter: string) => void;
  onSelectType: (typeKey: string, exts: string[]) => void;
  onTagCreated: () => void;
}

const MENU_STYLE: React.CSSProperties = {
  padding: '4px 16px', cursor: 'pointer', display: 'flex',
  alignItems: 'center', gap: 8, fontSize: 13, borderRadius: 6,
};
const MENU_ACTIVE: React.CSSProperties = {
  ...MENU_STYLE, background: '#ede9fe', color: '#6366f1', fontWeight: 600,
};
const SECTION_HEADER: React.CSSProperties = {
  padding: '12px 16px 4px', fontSize: 11, color: '#999',
  textTransform: 'uppercase', fontWeight: 600,
};

const WORD_EXTS = ['.doc', '.docx', '.docm', '.dotx', '.odt', '.rtf'];
const EXCEL_EXTS = ['.xls', '.xlsx', '.xlsm', '.csv', '.xltx', '.ods'];
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp', '.ico', '.tiff', '.tif'];

export default function TagPanel({
  tags, typeCounts, selectedTagIds, currentFilter, currentTypeFilter,
  onSelectTags, onSelectFilter, onSelectType, onTagCreated,
}: TagPanelProps) {
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#6366f1');

  const handleCreateTag = async () => {
    const name = newTagName.trim();
    if (!name) return;
    try {
      await tagApi.create(name, newTagColor);
      setNewTagName('');
      message.success(`标签"${name}"已创建`);
      onTagCreated();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '创建失败';
      message.error(msg);
    }
  };

  const handleTagClick = (tagId: string, e: React.MouseEvent) => {
    if (e.ctrlKey) {
      const idx = selectedTagIds.indexOf(tagId);
      onSelectTags(idx >= 0 ? selectedTagIds.filter(id => id !== tagId) : [...selectedTagIds, tagId]);
    } else {
      onSelectTags(selectedTagIds.length === 1 && selectedTagIds[0] === tagId ? [] : [tagId]);
    }
  };

  const typeItems = [
    { key: 'pdf', exts: ['.pdf'], icon: <FilePdfOutlined />, label: 'PDF', count: typeCounts.pdf },
    { key: 'word', exts: WORD_EXTS, icon: <FileWordOutlined />, label: 'Word', count: typeCounts.word },
    { key: 'excel', exts: EXCEL_EXTS, icon: <FileExcelOutlined />, label: 'Excel', count: typeCounts.excel },
    { key: 'image', exts: IMAGE_EXTS, icon: <FileImageOutlined />, label: '图片', count: typeCounts.image },
    { key: 'other', exts: ['__other__'], icon: <FileOutlined />, label: '其他', count: typeCounts.other },
  ];

  return (
    <div style={{ padding: '4px 0' }}>
      {/* 快捷筛选 */}
      <div style={SECTION_HEADER}>⚡ 快捷筛选</div>
      <div
        style={currentFilter === 'recent' ? MENU_ACTIVE : MENU_STYLE}
        onClick={() => onSelectFilter('recent')}
      >
        <ClockCircleOutlined /> 最近添加
      </div>
      <div
        style={currentFilter === 'untagged' ? MENU_ACTIVE : MENU_STYLE}
        onClick={() => onSelectFilter('untagged')}
      >
        <TagsOutlined /> 未打标签
      </div>
      <div
        style={currentFilter === 'frequent' ? MENU_ACTIVE : MENU_STYLE}
        onClick={() => onSelectFilter('frequent')}
      >
        <StarOutlined /> 常用文档
      </div>

      <Divider style={{ margin: '8px 0' }} />

      {/* 文件类型 */}
      <div style={SECTION_HEADER}>📑 文件类型</div>
      {typeItems.map(item => (
        <div
          key={item.key}
          style={currentFilter === 'type' && currentTypeFilter === item.key ? MENU_ACTIVE : MENU_STYLE}
          onClick={() => onSelectType(item.key, item.exts)}
        >
          {item.icon}
          <span style={{ flex: 1 }}>{item.label}</span>
          <span style={{ fontSize: 11, color: '#999' }}>{item.count}</span>
        </div>
      ))}

      <Divider style={{ margin: '8px 0' }} />

      {/* 标签云 */}
      <div style={SECTION_HEADER}>🏷️ 标签云</div>
      <div style={{ padding: '4px 16px', display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
        {tags.map(tag => {
          const selected = selectedTagIds.includes(tag.id);
          return (
            <Tag
              key={tag.id}
              color={tag.color}
              style={{
                cursor: 'pointer', margin: 0, fontSize: 12,
                border: selected ? `2px solid ${tag.color}` : '1px solid transparent',
                fontWeight: selected ? 600 : 400,
              }}
              onClick={(e) => handleTagClick(tag.id, e)}
            >
              {tag.name} ({tag.file_count})
            </Tag>
          );
        })}
      </div>
      <div style={{ padding: '0 16px', fontSize: 11, color: '#999', marginBottom: 8 }}>
        💡 Ctrl+点击 多选标签，交集筛选
      </div>

      {/* 创建标签 */}
      <div style={{ padding: '0 16px', display: 'flex', gap: 4 }}>
        <Input
          size="small"
          placeholder="新标签名"
          value={newTagName}
          onChange={e => setNewTagName(e.target.value)}
          onPressEnter={handleCreateTag}
          style={{ flex: 1 }}
        />
        <ColorPicker
          value={newTagColor}
          onChange={(_, hex) => setNewTagColor(hex)}
          size="small"
        />
        <Button size="small" icon={<PlusOutlined />} onClick={handleCreateTag} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer-react/src/components/TagPanel.tsx
git commit -m "feat: add TagPanel component with filters and tag cloud"
```

---

### Task 16: FileList 组件

**Files:**
- Create: `src/renderer-react/src/components/FileList.tsx`

- [ ] **Step 1: 实现文档主看板**

```tsx
// src/renderer-react/src/components/FileList.tsx
import { Tag } from 'antd';
import {
  FilePdfOutlined, FileExcelOutlined, FileWordOutlined,
  FileImageOutlined, FileTextOutlined, FileOutlined,
} from '@ant-design/icons';
import type { FileInfo } from '@/types';

interface FileListProps {
  files: FileInfo[];
  selectedFileId: string | null;
  onFileClick: (id: string) => void;
  onFileDoubleClick: (id: string) => void;
  selectedTagIds: string[];
  onRemoveTagFilter: (tagId: string) => void;
}

function getIcon(ext: string) {
  const iconStyle = { fontSize: 24 };
  const extLower = ext.toLowerCase();
  if (extLower === '.pdf') return <FilePdfOutlined style={{ ...iconStyle, color: '#ef4444' }} />;
  if (['.doc', '.docx', '.docm', '.rtf', '.odt', '.dotx'].includes(extLower))
    return <FileWordOutlined style={{ ...iconStyle, color: '#3b82f6' }} />;
  if (['.xls', '.xlsx', '.xlsm', '.csv', '.ods', '.xltx'].includes(extLower))
    return <FileExcelOutlined style={{ ...iconStyle, color: '#10b981' }} />;
  if (['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp', '.ico', '.tiff', '.tif'].includes(extLower))
    return <FileImageOutlined style={{ ...iconStyle, color: '#f59e0b' }} />;
  if (extLower === '.txt') return <FileTextOutlined style={{ ...iconStyle, color: '#6b7280' }} />;
  return <FileOutlined style={{ ...iconStyle, color: '#6b7280' }} />;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('zh-CN') + ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

const ROW_STYLE: React.CSSProperties = {
  display: 'flex', alignItems: 'center', padding: '10px 16px', gap: 12,
  cursor: 'pointer', borderBottom: '1px solid #f5f5f5',
};
const ROW_EVEN: React.CSSProperties = { ...ROW_STYLE, background: '#fafafa' };
const ROW_SELECTED: React.CSSProperties = { ...ROW_STYLE, background: '#ede9fe' };

export default function FileList({
  files, selectedFileId, onFileClick, onFileDoubleClick,
  selectedTagIds, onRemoveTagFilter,
}: FileListProps) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {selectedTagIds.length > 0 && (
        <div style={{
          padding: '6px 16px', background: '#fafafa', borderBottom: '1px solid #f0f0f0',
          display: 'flex', alignItems: 'center', gap: 8, fontSize: 12,
        }}>
          <span style={{ color: '#999' }}>当前筛选：</span>
          {selectedTagIds.map(tid => (
            <Tag key={tid} closable onClose={() => onRemoveTagFilter(tid)}>{tid}</Tag>
          ))}
          <span style={{ marginLeft: 'auto', color: '#999' }}>{files.length} 个结果</span>
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto' }}>
        {files.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>
            暂无文件，拖拽文件到此处或点击"导入文件"
          </div>
        ) : (
          files.map((f, i) => {
            const isSelected = f.id === selectedFileId;
            const isEven = i % 2 === 1;
            let rowStyle = ROW_STYLE;
            if (isSelected) rowStyle = ROW_SELECTED;
            else if (isEven) rowStyle = ROW_EVEN;

            return (
              <div
                key={f.id}
                style={rowStyle}
                onClick={() => onFileClick(f.id)}
                onDoubleClick={() => onFileDoubleClick(f.id)}
              >
                <div style={{ width: 32, textAlign: 'center', flexShrink: 0 }}>
                  {getIcon(f.ext)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {f.name}
                  </div>
                  <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                    {formatSize(f.size)} · {formatDate(f.imported_at)}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', maxWidth: 220, justifyContent: 'flex-end' }}>
                  {(f.tags || []).map(t => (
                    <Tag key={t.id} color={t.color} style={{ margin: 0, fontSize: 11 }}>
                      {t.name}
                    </Tag>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer-react/src/components/FileList.tsx
git commit -m "feat: add FileList component with file list rendering"
```

---

### Task 17: FileDetail 组件

**Files:**
- Create: `src/renderer-react/src/components/FileDetail.tsx`

- [ ] **Step 1: 实现右侧详情 Drawer**

```tsx
// src/renderer-react/src/components/FileDetail.tsx
import { useState, useEffect, useCallback } from 'react';
import { Drawer, Tag, Button, Input, Space, message, Select, Divider } from 'antd';
import { EditOutlined, FolderOpenOutlined, DeleteOutlined } from '@ant-design/icons';
import type { FileDetail as FileDetailType, TagInfo } from '@/types';
import { fileApi, tagApi } from '@/api/ipc';

interface FileDetailProps {
  fileId: string | null;
  open: boolean;
  allTags: TagInfo[];
  onClose: () => void;
  onUpdated: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('zh-CN') + ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

export default function FileDetail({ fileId, open, allTags, onClose, onUpdated }: FileDetailProps) {
  const [detail, setDetail] = useState<FileDetailType | null>(null);
  const [note, setNote] = useState('');
  const [addingTag, setAddingTag] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!fileId) return;
    try {
      const d = await fileApi.detail(fileId);
      setDetail(d);
      setNote(d.note || '');
    } catch {
      message.error('加载文件详情失败');
    }
  }, [fileId]);

  useEffect(() => { if (open) loadDetail(); }, [open, loadDetail]);

  const handleNoteSave = async () => {
    if (!detail) return;
    await fileApi.update(detail.id, { note });
    message.success('备注已保存');
  };

  const handleRemoveTag = async (tagId: string) => {
    if (!detail) return;
    const newIds = detail.tags.filter(t => t.id !== tagId).map(t => t.id);
    await tagApi.setOnFile(detail.id, newIds);
    loadDetail();
    onUpdated();
  };

  const handleAddTag = async (tagId: string) => {
    if (!detail) return;
    const newIds = [...detail.tags.map(t => t.id), tagId];
    await tagApi.setOnFile(detail.id, newIds);
    loadDetail();
    onUpdated();
    setAddingTag(false);
  };

  const handleCreateAndAddTag = async (name: string) => {
    if (!detail || !name.trim()) return;
    try {
      const tag = await tagApi.create(name.trim());
      const newIds = [...detail.tags.map(t => t.id), tag.id];
      await tagApi.setOnFile(detail.id, newIds);
      loadDetail();
      onUpdated();
      setAddingTag(false);
      message.success(`标签"${name}"已创建并添加`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '操作失败';
      message.error(msg);
    }
  };

  const handleDelete = async () => {
    if (!detail) return;
    await fileApi.delete([detail.id]);
    message.success('文件已删除');
    onClose();
    onUpdated();
  };

  if (!detail) return null;

  const availableTags = allTags.filter(t => !detail.tags.some(dt => dt.id === t.id));

  return (
    <Drawer
      title={detail.name}
      open={open}
      onClose={onClose}
      width={300}
      styles={{ body: { padding: 16 } }}
    >
      <div style={{ fontSize: 12, color: '#999', marginBottom: 16 }}>
        {detail.ext} · {formatSize(detail.size)} · 打开 {detail.openCount} 次
      </div>

      {/* 标签 */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: '#999', marginBottom: 6 }}>标签</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
          {detail.tags.map(t => (
            <Tag key={t.id} color={t.color} closable onClose={() => handleRemoveTag(t.id)}>
              {t.name}
            </Tag>
          ))}
        </div>
        {!addingTag ? (
          <Button size="small" icon={<EditOutlined />} onClick={() => setAddingTag(true)}>
            添加标签
          </Button>
        ) : (
          <Space direction="vertical" style={{ width: '100%' }}>
            <Select
              size="small"
              style={{ width: '100%' }}
              placeholder="选择已有标签..."
              options={availableTags.map(t => ({ label: t.name, value: t.id }))}
              onChange={(val) => handleAddTag(val)}
            />
            <Input.Search
              size="small"
              placeholder="或输入新标签名创建..."
              enterButton="创建"
              onSearch={handleCreateAndAddTag}
            />
            <Button size="small" onClick={() => setAddingTag(false)}>取消</Button>
          </Space>
        )}
      </div>

      {/* 备注 */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: '#999', marginBottom: 6 }}>备注</div>
        <Input.TextArea
          value={note}
          onChange={e => setNote(e.target.value)}
          onBlur={handleNoteSave}
          placeholder="添加备注..."
          rows={3}
        />
      </div>

      <Divider />

      {/* 文件信息 */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: '#999', marginBottom: 6 }}>文件信息</div>
        <div style={{ fontSize: 11, color: '#999', lineHeight: 1.8 }}>
          导入：{formatDate(detail.imported_at)}<br />
          路径：{detail.storage_path}<br />
          大小：{formatSize(detail.size)}
        </div>
      </div>

      {/* 操作按钮 */}
      <Space direction="vertical" style={{ width: '100%' }}>
        <Button
          block
          icon={<FolderOpenOutlined />}
          onClick={() => fileApi.open(detail.id).then(() => onUpdated())}
        >
          打开文件
        </Button>
        <Button
          block
          onClick={() => fileApi.showInDir(detail.id)}
        >
          在文件夹中显示
        </Button>
        <Button
          block
          danger
          icon={<DeleteOutlined />}
          onClick={handleDelete}
        >
          删除文件
        </Button>
      </Space>
    </Drawer>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer-react/src/components/FileDetail.tsx
git commit -m "feat: add FileDetail Drawer component"
```

---

### Task 18: ImportZone 拖拽导入组件

**Files:**
- Create: `src/renderer-react/src/components/ImportZone.tsx`

- [ ] **Step 1: 实现拖拽导入区域**

```tsx
// src/renderer-react/src/components/ImportZone.tsx
import { useState, useCallback, type DragEvent, type ReactNode } from 'react';

interface ImportZoneProps {
  onImport: (paths: string[]) => void;
  children: ReactNode;
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
  background: 'rgba(99, 102, 241, 0.12)', display: 'flex',
  alignItems: 'center', justifyContent: 'center',
  fontSize: 28, color: '#6366f1', zIndex: 9999,
  pointerEvents: 'none', userSelect: 'none',
};

export default function ImportZone({ onImport, children }: ImportZoneProps) {
  const [dragging, setDragging] = useState(false);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.target === e.currentTarget) {
      setDragging(false);
    }
  }, []);

  const handleDrop = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    const paths = files.map(f => (f as unknown as { path?: string }).path).filter(Boolean) as string[];
    if (paths.length > 0) {
      onImport(paths);
    }
  }, [onImport]);

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{ height: '100vh' }}
    >
      {children}
      {dragging && (
        <div style={overlayStyle}>
          📥 松开以导入文件
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/renderer-react/src/components/ImportZone.tsx
git commit -m "feat: add ImportZone drag-and-drop import component"
```

---

### Task 19: 整合验证与样式微调

- [ ] **Step 1: 启动 React 开发模式**

```bash
cd E:\code\smartDoc && npm run dev
```

预期：
1. Vite 在 localhost:5173 启动
2. Electron 窗口打开，加载 React 页面
3. 显示 smartDoc 完整 UI

- [ ] **Step 2: 验证全部功能**

逐一验证：
1. **导入文件** — 点击"导入文件"按钮 / 拖拽文件到窗口
2. **文件列表** — 文件正确显示，图标、大小、日期、标签 Chip
3. **搜索** — 输入关键词，300ms 后自动搜索
4. **左侧面板** — 快捷筛选（最近/未标签/常用）/ 类型分类 / 标签云多选
5. **标签操作** — 创建标签、添加标签到文件、移除标签
6. **文件详情** — 单击文件弹出 Drawer
7. **打开文件** — 双击文件 / Drawer 中"打开文件"
8. **备注编辑** — 失焦自动保存
9. **删除文件** — Drawer 中"删除文件"
10. **拖拽导入** — 拖拽显示遮罩，松手导入

- [ ] **Step 3: 修复样式不一致问题**

检查并修复：
- 文件列表行高一致
- 标签 Chip 颜色与标签设置一致
- Drawer 宽度与设计一致（240px 内容）
- 交替行背景色生效
- 当前筛选标签栏可正常移除

- [ ] **Step 4: 验证错误处理**

1. 尝试打开已被外部删除的文件 → 应提示"文件丢失"
2. 创建重名标签 → 应提示"标签名已存在"
3. 导入超大文件 → 应正常处理

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: complete Part 2 — React + Ant Design full UI, verified"
```

---

## 第二部分验收检查清单

- [ ] UI 布局一致性 — 对照设计文档第 4 节，布局吻合
- [ ] Ant Design 组件 — 全部 UI 使用 antd 组件，无原生 HTML 表单
- [ ] 图标使用 — 文件类型图标和操作图标使用 @ant-design/icons
- [ ] 交互细节 — 单击→Drawer，双击→打开文件，拖拽→遮罩→导入
- [ ] 第一部分全功能 — 在 React UI 中复验第一部分的全部后台功能（导入/标签/筛选/搜索/打开/备注）
- [ ] 错误处理 — 文件丢失提示、重复标签提示、超大文件导入
