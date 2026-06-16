// src/main/file-repo.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * 确保仓库目录存在
 */
function ensureRepoDir(repoPath) {
  const filesDir = path.join(repoPath, 'files');
  if (!fs.existsSync(filesDir)) {
    fs.mkdirSync(filesDir, { recursive: true });
  }
  return filesDir;
}

/**
 * 计算文件 MD5
 */
function md5File(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('md5');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * 检查磁盘剩余空间（字节）
 */
function checkDiskSpace(dirPath) {
  try {
    const stats = fs.statfsSync ? fs.statfsSync(dirPath) : null;
    if (stats) return stats.bsize * stats.bavail;
  } catch (_) {}
  return Infinity;
}

/**
 * 复制文件到仓库
 */
function copyToRepo(sourcePath, repoPath) {
  const filesDir = ensureRepoDir(repoPath);
  const ext = path.extname(sourcePath).toLowerCase();
  const id = crypto.randomUUID();
  const storageName = `${id}${ext}`;
  const destPath = path.join(filesDir, storageName);
  const relativePath = `files/${storageName}`;

  fs.copyFileSync(sourcePath, destPath);

  return { storagePath: relativePath, id };
}

/**
 * 删除仓库中的文件
 */
function deleteFromRepo(storagePath, repoPath) {
  const fullPath = path.join(repoPath, storagePath);
  if (fs.existsSync(fullPath)) {
    fs.unlinkSync(fullPath);
  }
}

/**
 * 批量获取文件信息（用于重复检测）
 */
function getFileStats(filePaths) {
  return filePaths.map(p => {
    const stat = fs.statSync(p);
    return {
      path: p,
      name: path.basename(p),
      ext: path.extname(p).toLowerCase(),
      size: stat.size,
    };
  });
}

module.exports = {
  ensureRepoDir,
  md5File,
  checkDiskSpace,
  copyToRepo,
  deleteFromRepo,
  getFileStats,
};
