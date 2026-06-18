// src/renderer/app.js
// ========== 状态 ==========
const state = {
  currentFiles: [],
  selectedFileId: null,
  selectedTagIds: [],
  currentFilter: null,
  allTags: [],
};

// ========== 工具函数 ==========
function $(sel) { return document.querySelector(sel); }
function $$(sel) { return document.querySelectorAll(sel); }
function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}
function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('zh-CN') + ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}
function getFileIcon(ext) {
  const map = { '.pdf': '📄', '.doc': '📝', '.docx': '📝', '.xls': '📊', '.xlsx': '📊',
    '.jpg': '🖼️', '.jpeg': '🖼️', '.png': '🖼️', '.gif': '🖼️', '.bmp': '🖼️', '.svg': '🖼️',
    '.txt': '📃', '.csv': '📊', '.zip': '📦', '.rar': '📦', '.7z': '📦',
    '.mp3': '🎵', '.mp4': '🎬', '.ppt': '📽️', '.pptx': '📽️' };
  return map[ext] || '📄';
}

// ========== Toast ==========
function showToast(msg) {
  const toast = $('#toast');
  toast.textContent = msg;
  toast.style.display = 'block';
  setTimeout(() => { toast.style.display = 'none'; }, 3000);
}

// ========== 搜索（debounce 300ms） ==========
let searchTimer = null;
$('#search-input').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(doSearch, 300);
});

async function doSearch() {
  const keyword = $('#search-input').value.trim();
  if (!keyword) { loadAllFiles(); return; }
  const files = await window.api.search.files(keyword);
  state.currentFiles = files;
  renderFileList();
}

// ========== 文件操作 ==========
async function loadAllFiles(query = {}) {
  try {
    if (state.selectedTagIds.length > 0) {
      query.tagIds = state.selectedTagIds;
    }
    state.currentFiles = await window.api.file.list(query);
    renderFileList();
  } catch (err) {
    console.error('loadAllFiles error:', err);
    showToast('加载文件列表失败');
  }
}

async function handleImport(paths) {
  if (!paths || paths.length === 0) return;
  const results = await window.api.file.import(paths);
  const imported = results.filter(r => r.status === 'imported');
  const dupes = results.filter(r => r.status === 'duplicate');
  const errors = results.filter(r => r.status === 'error');
  let msg = `成功导入 ${imported.length} 个文件`;
  if (dupes.length > 0) msg += `，${dupes.length} 个重复已跳过`;
  if (errors.length > 0) msg += `，${errors.length} 个失败`;
  showToast(msg);
  refreshAll();
}

async function handleOpenFile(id) {
  try {
    await window.api.file.open(id);
  } catch (err) {
    if (err.message === 'FILE_MISSING') {
      showToast('文件丢失，已被外部删除');
    } else {
      showToast('打开失败: ' + err.message);
    }
  }
  refreshAll();
}

async function handleDeleteFile(id) {
  if (!confirm('确定删除此文件？')) return;
  await window.api.file.delete([id]);
  state.selectedFileId = null;
  $('#detail-panel').style.display = 'none';
  showToast('文件已删除');
  refreshAll();
}

async function handleUpdateNote(id, note) {
  await window.api.file.update(id, { note });
}

async function showFileDetail(id) {
  try {
    state.selectedFileId = id;
    const detail = await window.api.file.detail(id);
    $('#detail-name').textContent = detail.name;
    $('#detail-meta').textContent = `${detail.ext} · ${formatSize(detail.size)} · 打开 ${detail.openCount} 次`;
    $('#detail-note').value = detail.note || '';

    $('#detail-tags').innerHTML = detail.tags.map(t =>
      `<span class="tag-chip" style="background:${t.color}20;color:${t.color};border-color:${t.color}" onclick="removeTagFromFile('${detail.id}','${t.id}')">${t.name} ✕</span>`
    ).join('');

    $('#detail-info').innerHTML = `
      导入：${formatDate(detail.imported_at)}<br>
      路径：${detail.storage_path}<br>
      大小：${formatSize(detail.size)}
    `;

    $('#detail-panel').style.display = 'flex';
    $('#file-list').querySelectorAll('.file-row').forEach(el => {
      el.classList.toggle('selected', el.dataset.id === id);
    });
  } catch (err) {
    console.error('showFileDetail error:', err);
    showToast('加载文件详情失败: ' + (err && err.message ? err.message : '未知错误'));
    state.selectedFileId = null;
  }
}

async function removeTagFromFile(fileId, tagId) {
  const detail = await window.api.file.detail(fileId);
  const newTagIds = detail.tags.filter(t => t.id !== tagId).map(t => t.id);
  await window.api.tag.setOnFile(fileId, newTagIds);
  showFileDetail(fileId);
  refreshAll();
}

// ========== 标签操作 ==========
async function loadTags() {
  const tags = await window.api.tag.list();
  state.allTags = tags;
  renderTagCloud();
}

function renderTagCloud() {
  const cloud = $('#tag-cloud');
  cloud.innerHTML = state.allTags.map(t => {
    const selected = state.selectedTagIds.includes(t.id);
    return `<span class="tag-chip ${selected ? 'selected' : ''}"
      style="background:${t.color}20;color:${t.color};${selected ? 'border-color:'+t.color : ''}"
      data-tag-id="${t.id}"
      onclick="toggleTagFilter('${t.id}', event)">
      ${t.name} <small>(${t.file_count})</small>
    </span>`;
  }).join('');
}

function toggleTagFilter(tagId, event) {
  if (event.ctrlKey) {
    const idx = state.selectedTagIds.indexOf(tagId);
    if (idx >= 0) state.selectedTagIds.splice(idx, 1);
    else state.selectedTagIds.push(tagId);
  } else {
    if (state.selectedTagIds.length === 1 && state.selectedTagIds[0] === tagId) {
      state.selectedTagIds = [];
    } else {
      state.selectedTagIds = [tagId];
    }
  }

  if (state.selectedTagIds.length > 0) {
    $('#selected-tags-bar').style.display = 'block';
    $('#selected-tags-list').textContent = state.selectedTagIds
      .map(id => state.allTags.find(t => t.id === id)?.name).join(' + ');
  } else {
    $('#selected-tags-bar').style.display = 'none';
  }

  loadAllFiles();
  renderTagCloud();
}

$('#btn-clear-tags').addEventListener('click', () => {
  state.selectedTagIds = [];
  $('#selected-tags-bar').style.display = 'none';
  loadAllFiles();
  renderTagCloud();
});

$('#btn-create-tag').addEventListener('click', async () => {
  try {
    const name = $('#new-tag-name').value.trim();
    if (!name) { showToast('请输入标签名'); return; }
    const color = $('#new-tag-color').value;
    await window.api.tag.create(name, color);
    $('#new-tag-name').value = '';
    refreshAll();
    showToast(`标签 "${name}" 已创建`);
  } catch (err) {
    showToast(err && err.message ? err.message : '创建标签失败');
    console.error('create tag error:', err);
  }
});

$('#btn-detail-add-tag').addEventListener('click', async () => {
  try {
    const fileId = state.selectedFileId;
    if (!fileId) { showToast('请先选择一个文件'); return; }

    const detail = await window.api.file.detail(fileId);
    const existingIds = detail.tags.map(t => t.id);
    const available = state.allTags.filter(t => !existingIds.includes(t.id));

    if (available.length === 0) {
      showToast('没有可添加的标签，请在左侧面板先创建新标签');
      return;
    }

    const tagName = prompt('输入要添加的标签名（或新标签名）:\n已有标签：' + available.map(t => t.name).join(', '));
    if (!tagName) return;

    let tag = state.allTags.find(t => t.name === tagName);
    if (!tag) {
      tag = await window.api.tag.create(tagName, '#6366f1');
    }
    await window.api.tag.setOnFile(fileId, [...existingIds, tag.id]);
    showFileDetail(fileId);
    refreshAll();
    showToast(`已添加标签 "${tag.name}"`);
  } catch (err) {
    showToast(err && err.message ? err.message : '添加标签失败');
    console.error('add tag error:', err);
  }
});

// ========== 左侧面板筛选 ==========
$('#quick-filters').addEventListener('click', async (e) => {
  const li = e.target.closest('li');
  if (!li) return;

  state.selectedTagIds = [];
  state.currentFilter = li.dataset.filter;

  let result;
  switch (li.dataset.filter) {
    case 'recent': result = await window.api.panel.recent(50); break;
    case 'untagged': result = await window.api.panel.untagged(); break;
    case 'frequent': result = await window.api.panel.frequent(); break;
  }

  state.currentFiles = result.files;
  renderFileList();
  updateFilterLabel(li.textContent.trim());

  $$('#quick-filters li').forEach(l => l.classList.remove('active'));
  li.classList.add('active');
  $$('#type-filters li').forEach(l => l.classList.remove('active'));
});

$('#type-filters').addEventListener('click', async (e) => {
  const li = e.target.closest('li');
  if (!li) return;

  state.currentFilter = 'type:' + li.dataset.type;

  const typeMap = {
    pdf: ['.pdf'],
    word: ['.doc', '.docx', '.docm', '.dotx', '.odt', '.rtf'],
    excel: ['.xls', '.xlsx', '.xlsm', '.csv', '.xltx', '.ods'],
    image: ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.svg', '.webp', '.ico', '.tiff', '.tif'],
  };

  const exts = typeMap[li.dataset.type];
  if (exts) {
    state.currentFiles = await window.api.file.list({ exts });
  } else {
    state.currentFiles = await window.api.file.list({});
  }

  renderFileList();
  updateFilterLabel(li.textContent.trim());

  $$('#quick-filters li').forEach(l => l.classList.remove('active'));
  $$('#type-filters li').forEach(l => l.classList.remove('active'));
  li.classList.add('active');
});

function updateFilterLabel(text) {
  $('#current-filter-label').textContent = text;
}

// ========== 渲染文件列表 ==========
function renderFileList() {
  const container = $('#file-list');
  if (state.currentFiles.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:40px;color:#999">暂无文件，拖拽文件到此处或点击"导入文件"</div>';
  } else {
    container.innerHTML = state.currentFiles.map(f => `
      <div class="file-row" data-id="${f.id}" onclick="showFileDetail('${f.id}')" ondblclick="handleOpenFile('${f.id}')">
        <div class="file-icon">${getFileIcon(f.ext)}</div>
        <div class="file-info">
          <div class="file-name">${escapeHtml(f.name)}</div>
          <div class="file-meta">${formatSize(f.size)} · ${formatDate(f.imported_at)}</div>
        </div>
        <div class="file-tags">
          ${(f.tags || []).map(t => `<span class="tag-chip" style="background:${t.color}20;color:${t.color}">${escapeHtml(t.name)}</span>`).join('')}
        </div>
      </div>
    `).join('');
  }
  $('#file-count').textContent = state.currentFiles.length + ' 个文件';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ========== 详情面板操作 ==========
let noteSaveTimer = null;
$('#detail-note').addEventListener('input', () => {
  clearTimeout(noteSaveTimer);
  noteSaveTimer = setTimeout(async () => {
    if (state.selectedFileId) {
      await handleUpdateNote(state.selectedFileId, $('#detail-note').value);
    }
  }, 500);
});

$('#btn-open-file').addEventListener('click', () => {
  if (state.selectedFileId) handleOpenFile(state.selectedFileId);
});
$('#btn-show-in-dir').addEventListener('click', () => {
  if (state.selectedFileId) window.api.file.showInDir(state.selectedFileId);
});
$('#btn-delete-file').addEventListener('click', () => {
  if (state.selectedFileId) handleDeleteFile(state.selectedFileId);
});

// ========== 导入 ==========
$('#btn-import').addEventListener('click', async () => {
  const paths = await window.api.dialog.openFiles();
  if (paths && paths.length > 0) handleImport(paths);
});

// ========== 拖拽导入 ==========
document.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
  $('#drop-overlay').style.display = 'flex';
});
document.addEventListener('dragleave', (e) => {
  e.preventDefault();
  e.stopPropagation();
  if (e.target === document.documentElement) {
    $('#drop-overlay').style.display = 'none';
  }
});
document.addEventListener('drop', async (e) => {
  e.preventDefault();
  e.stopPropagation();
  $('#drop-overlay').style.display = 'none';
  const files = Array.from(e.dataTransfer.files);
  const paths = files.map(f => f.path).filter(Boolean);
  if (paths.length > 0) handleImport(paths);
});

// ========== 刷新全部 ==========
async function refreshAll() {
  await loadTags();
  await loadTypeCounts();

  switch (state.currentFilter) {
    case 'recent': {
      const r = await window.api.panel.recent(50);
      state.currentFiles = r.files;
      break;
    }
    case 'untagged': {
      const r = await window.api.panel.untagged();
      state.currentFiles = r.files;
      break;
    }
    case 'frequent': {
      const r = await window.api.panel.frequent();
      state.currentFiles = r.files;
      break;
    }
    default:
      await loadAllFiles();
  }
  renderFileList();
}

async function loadTypeCounts() {
  const counts = await window.api.panel.typeCounts();
  const map = { pdf: 'pdf', word: 'word', excel: 'excel', image: 'image', other: 'other' };
  for (const [key, liType] of Object.entries(map)) {
    const el = $(`#type-filters [data-type="${liType}"] .count`);
    if (el) el.textContent = counts[key] || 0;
  }
}

// ========== 初始化 ==========
async function init() {
  try {
    await refreshAll();
  } catch (err) {
    console.error('App init error:', err);
    showToast('应用初始化失败，请刷新页面');
  }
}

init();
