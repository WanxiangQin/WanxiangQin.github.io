import { promises as fs } from 'fs';
import path from 'path';

// Root is repo root when run from project; adjust if needed
const rootDir = process.cwd();
const modelsDir = path.join(rootDir, '3dgsmodel');
const outputPath = path.join(modelsDir, 'models.json');

const ALLOWED_EXTS = new Set(['.ply', '.ksplat', '.splat']);

async function walk(dir, base = '') {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const results = [];
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    const rel = path.join(base, ent.name).replace(/\\/g, '/');
    if (ent.isDirectory()) {
      results.push(...(await walk(full, rel)));
    } else {
      const ext = path.extname(ent.name).toLowerCase();
      if (ALLOWED_EXTS.has(ext)) {
        const stat = await fs.stat(full);
        results.push({ path: rel, size: stat.size });
      }
    }
  }
  return results;
}

async function main() {
  try {
    await fs.access(modelsDir);
  } catch (e) {
    console.error('3dgsmodel directory not found:', modelsDir);
    process.exit(1);
  }

  const models = await walk(modelsDir);
  const json = { models };
  await fs.writeFile(outputPath, JSON.stringify(json, null, 2), 'utf8');
  console.log(`Wrote ${models.length} entries to`, outputPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});