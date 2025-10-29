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
  // 构建模型列表（相对路径）
  const base = '/3dgsmodel';
  const models = [
    'a-小型3DGS特殊效果.ply',
    'bonsai/bonsai.ksplat',
    'bonsai/bonsai_high.ksplat',
    'bonsai/bonsai_trimmed.ksplat',
    'garden/garden.ksplat',
    'garden/garden_high.ksplat',
    'stump/stump.ksplat',
    'stump/stump_high.ksplat',
    'truck/truck.ksplat',
    'truck/truck_high.ksplat',
  ];

  const toReadableSize = (bytes) => {
    if (!bytes || isNaN(bytes)) return '大小未知';
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

  const populateSelect = async () => {
    if (!modelSelect) return;
    modelSelect.innerHTML = '';
    for (const rel of models) {
      const url = `${base}/${rel}`;
      const size = await fetchSize(url);
      const name = rel.split('/').pop();
      const opt = document.createElement('option');
      opt.value = url;
      opt.textContent = `${name} (${toReadableSize(size)})`;
      opt.dataset.ext = rel.split('.').pop().toLowerCase();
      modelSelect.appendChild(opt);
    }
  };
  populateSelect();
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