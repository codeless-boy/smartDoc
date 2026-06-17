// src/main/main.js
const { app, BrowserWindow } = require('electron');
const path = require('path');
const { init } = require('./database');
const { setRepoPath, registerAllHandlers } = require('./ipc-handlers');
const { ensureRepoDir } = require('./file-repo');

let mainWindow = null;

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

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(async () => {
  // 初始化数据库
  const userDataPath = app.getPath('userData');
  const dbPath = path.join(userDataPath, 'smartdoc.db');
  await init(dbPath);

  // 初始化文件仓库
  const repoPath = path.join(app.getPath('documents'), 'smartDoc-repo');
  ensureRepoDir(repoPath);

  // 注册 IPC 处理器
  setRepoPath(repoPath);
  registerAllHandlers();

  createWindow();
});

app.on('window-all-closed', () => {
  const { close } = require('./database');
  close();
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
