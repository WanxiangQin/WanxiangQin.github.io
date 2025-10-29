// 独立填充模型下拉的脚本，不依赖 Three/GS3D 库
const statusEl = document.getElementById('viewerStatus');
const modelSelect = document.getElementById('modelSelect');
const setStatus = (t) => { if (statusEl) statusEl.textContent = t; };

function getBasePrefix() {
  const host = location.hostname;
  const isGithub = host.endsWith('github.io');
  if (!isGithub) return '';
  const owner = host.split('.')[0];
  const segs = location.pathname.split('/').filter(Boolean);
  const repo = segs[0] || `${owner}.github.io`;
  return repo === `${owner}.github.io` ? '' : `/${repo}`;
}

window.addEventListener('DOMContentLoaded', async () => {
  try {
    if (!modelSelect) return;
    const basePrefix = getBasePrefix();
    const base = `${basePrefix}/3dgsmodel`;
    const allowedExt = new Set(['ply', 'ksplat', 'splat']);

    const res = await fetch(`${base}/models.json`);
    if (!res.ok) {
      setStatus('未发现模型：无法读取 /3dgsmodel/models.json');
      return;
    }
    const data = await res.json();
    const arr = Array.isArray(data) ? data : data.models;
    if (!Array.isArray(arr) || arr.length === 0) {
      setStatus('未发现模型：清单为空');
      return;
    }

    const items = [];
    for (const item of arr) {
      const p = typeof item === 'string' ? item : item?.path;
      if (!p) continue;
      const ext = p.split('.').pop().toLowerCase();
      if (!allowedExt.has(ext)) continue;
      const url = `${base}/${p}`;
      items.push({ url, ext, name: p.split('/').pop() });
    }

    modelSelect.innerHTML = '';
    for (const it of items) {
      const opt = document.createElement('option');
      opt.value = it.url;
      opt.textContent = it.name; // 简化：不显示大小，避免 HEAD 请求
      opt.dataset.ext = it.ext;
      modelSelect.appendChild(opt);
    }
    setStatus(`已发现 ${items.length} 个模型，可选择后加载`);
  } catch (e) {
    console.warn('Model list populate error:', e);
    setStatus(`未发现模型：${e?.message || e}`);
  }
});