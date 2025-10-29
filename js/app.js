import { Viewer, SceneFormat, RenderMode } from '@mkkellogg/gaussian-splats-3d';
import * as THREE from 'three';

const root = document.getElementById('threeRoot');
const btnLoadPLY = document.getElementById('btnLoadPLY');
const fileInput = document.getElementById('fileInput');
const modelSelect = document.getElementById('modelSelect');
const btnLoadSelected = document.getElementById('btnLoadSelected');
const statusEl = document.getElementById('viewerStatus');
const setStatus = (t) => { if (statusEl) statusEl.textContent = t; };

const viewer = new Viewer({
  rootElement: root,
  sphericalHarmonicsDegree: 2,
  antialiased: true,
  ignoreDevicePixelRatio: false,
  gpuAcceleratedSort: false,
  sharedMemoryForWorkers: false,
  renderMode: RenderMode.Always,
  cameraUp: [0, -1, -0.17],
  initialCameraPosition: [0, 0, -5],
  initialCameraLookAt: [0, 0, 0],
});

let started = false;
async function clearScenes() {
  const count = viewer.getSceneCount?.() || 0;
  if (count > 0) {
    const idx = Array.from({ length: count }, (_, i) => i);
    setStatus(`清除旧场景：${count} 个...`);
    await viewer.removeSplatScenes(idx, true).catch((e) => {
      console.warn('Remove scenes failed:', e);
    });
  }
}

async function addScene(pathOrUrl, opts = {}) {
  setStatus('开始加载...');
  await clearScenes();
  await viewer.addSplatScene(pathOrUrl, {
    progressiveLoad: false,
    showLoadingUI: true,
    onProgress: (pct, label, phase) => {
      setStatus(`加载中：${label} (${pct}%) / 阶段：${phase}`);
    },
    ...opts,
  });
  // 使用相机参数控制视角，无需旋转模型
  setStatus(`已加载场景，使用标准相机视角`);
  // 自动框选到场景
  try {
    const splatMesh = viewer.getSplatMesh();
    if (splatMesh) {
      const bbox = splatMesh.computeBoundingBox(true);
      const center = bbox.getCenter(new THREE.Vector3());
      const size = bbox.getSize(new THREE.Vector3());
      const radius = Math.max(size.x, size.y, size.z) || 1;
      const cam = viewer.camera;
      cam.position.set(center.x + radius, center.y + radius * 0.6, center.z + radius);
      cam.lookAt(center);
      if (viewer.controls) {
        viewer.controls.target.copy(center);
        viewer.controls.update();
      }
      viewer.forceRenderNextFrame?.();
      setStatus(`已加载：中心(${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)}) 尺寸(${size.x.toFixed(2)}, ${size.y.toFixed(2)}, ${size.z.toFixed(2)}) 场景数=${viewer.getSceneCount()}`);
    }
  } catch (e) {
    console.warn('Auto-frame failed:', e);
    setStatus(`自动对焦失败：${e?.message || e}`);
  }
  if (!started) {
    viewer.start();
    started = true;
  }
}

btnLoadPLY?.addEventListener('click', () => {
  addScene('/3dgsmodel/a-小型3DGS特殊效果.ply', {
    format: SceneFormat.Ply,
    splatAlphaRemovalThreshold: 0,
  });
});

fileInput?.addEventListener('change', () => {
  const file = fileInput.files && fileInput.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  addScene(url, { splatAlphaRemovalThreshold: 0 }).catch(console.error);
  // 可选：稍后释放 URL；若需长期使用可保留
  // setTimeout(() => URL.revokeObjectURL(url), 60_000);
});

window.addEventListener('resize', () => viewer.onWindowResize());

// 页面加载后自动尝试加载示例，便于快速验证
window.addEventListener('DOMContentLoaded', () => {
  setStatus('未加载，选择模型后点击“加载所选模型”。');
  const base = '/3dgsmodel';
  const allowedExt = new Set(['ply', 'ksplat', 'splat']);

  const toReadableSize = (bytes) => {
    if (bytes == null || isNaN(bytes)) return '大小未知';
    const mb = bytes / (1024 * 1024);
    if (mb >= 1) return `${mb.toFixed(2)} MB`;
    const kb = bytes / 1024;
    return `${kb.toFixed(0)} KB`;
  };

  const fetchSize = async (url) => {
    try {
      const res = await fetch(url, { method: 'HEAD' });
      const len = res.headers.get('content-length');
      return len ? parseInt(len, 10) : NaN;
    } catch (_) {
      return NaN;
    }
  };

  // 方式一：尝试解析服务器的目录索引页面（本地 serve 可用）
  const listViaHtml = async (dirUrl) => {
    try {
      const res = await fetch(dirUrl);
      const ct = res.headers.get('content-type') || '';
      if (!res.ok || !ct.includes('text/html')) return [];
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const anchors = Array.from(doc.querySelectorAll('a[href]'));
      const entries = anchors.map(a => {
        const href = a.getAttribute('href');
        try {
          const url = new URL(href, dirUrl);
          return url.pathname;
        } catch {
          return null;
        }
      }).filter(Boolean);
      // 递归遍历子目录
      const files = [];
      for (const p of entries) {
        if (p.endsWith('/')) {
          const sub = await listViaHtml(p);
          files.push(...sub);
        } else {
          const ext = p.split('.').pop().toLowerCase();
          if (allowedExt.has(ext)) files.push(p);
        }
      }
      // 去重
      return Array.from(new Set(files));
    } catch {
      return [];
    }
  };

  // 方式二：GitHub Pages 下使用 GitHub API 递归列出文件
  const listViaGithub = async () => {
    try {
      const host = location.hostname;
      if (!host.endsWith('github.io')) return [];
      const owner = host.split('.')[0];
      const repo = `${owner}.github.io`;
      const apiBase = `https://api.github.com/repos/${owner}/${repo}/contents/`;

      const walk = async (path) => {
        const res = await fetch(apiBase + path);
        if (!res.ok) return [];
        const items = await res.json();
        const acc = [];
        for (const it of items) {
          if (it.type === 'dir') {
            acc.push(...(await walk(it.path)));
          } else if (it.type === 'file') {
            const ext = it.name.split('.').pop().toLowerCase();
            if (allowedExt.has(ext)) {
              acc.push({ path: `/${it.path}`, size: it.size, ext });
            }
          }
        }
        return acc;
      };
      const list = await walk('3dgsmodel');
      // 返回统一结构
      return list.map(x => ({ url: x.path, size: x.size, ext: x.ext, name: x.path.split('/').pop() }));
    } catch {
      return [];
    }
  };

  const discoverModels = async () => {
    // 优先尝试目录索引（同源路径），获取到相对路径列表
    const htmlList = await listViaHtml(base);
    if (htmlList.length > 0) {
      const out = [];
      for (const p of htmlList) {
        const ext = p.split('.').pop().toLowerCase();
        const size = await fetchSize(p).catch(() => NaN);
        out.push({ url: p, size, ext, name: p.split('/').pop() });
      }
      return out;
    }
    // GitHub API 作为回退方案（仅 github.io 域名）
    const ghList = await listViaGithub();
    if (ghList.length > 0) return ghList;
    // 最后回退到静态内置列表（防止完全不可用）
    const fallback = [
      `${base}/a-小型3DGS特殊效果.ply`,
      `${base}/bonsai/bonsai.ksplat`,
      `${base}/bonsai/bonsai_high.ksplat`,
      `${base}/bonsai/bonsai_trimmed.ksplat`,
      `${base}/garden/garden.ksplat`,
      `${base}/garden/garden_high.ksplat`,
      `${base}/stump/stump.ksplat`,
      `${base}/stump/stump_high.ksplat`,
      `${base}/truck/truck.ksplat`,
      `${base}/truck/truck_high.ksplat`,
    ];
    return await Promise.all(fallback.map(async (u) => {
      const name = u.split('/').pop();
      const ext = name.split('.').pop().toLowerCase();
      const size = await fetchSize(u).catch(() => NaN);
      return { url: u, size, ext, name };
    }));
  };

  const populateSelect = async () => {
    if (!modelSelect) return;
    modelSelect.innerHTML = '';
    const items = await discoverModels();
    for (const it of items) {
      const opt = document.createElement('option');
      opt.value = it.url;
      opt.textContent = `${it.name} (${toReadableSize(it.size)})`;
      opt.dataset.ext = it.ext;
      modelSelect.appendChild(opt);
    }
  };

  populateSelect().catch((e) => {
    console.warn('Populate model list failed:', e);
  });
});

btnLoadSelected?.addEventListener('click', () => {
  if (!modelSelect || !modelSelect.value) return;
  const url = modelSelect.value;
  const ext = modelSelect.selectedOptions[0]?.dataset?.ext;
  let format = undefined;
  if (ext === 'ply') format = SceneFormat.Ply;
  else if (ext === 'ksplat') format = SceneFormat.KSplat;
  else if (ext === 'splat') format = SceneFormat.Splat;
  addScene(url, { format, splatAlphaRemovalThreshold: 0 });
});