import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function buildPngs() {
  const outDir = path.resolve('public/icons');
  const srcSvg = path.resolve('public/icons/icon-512.svg');
  await ensureDir(outDir);

  const tasks = [
    { size: 192, out: 'icon-192.png' },
    { size: 512, out: 'icon-512.png' },
    { size: 180, out: 'apple-touch-icon.png' }
  ];

  for (const t of tasks) {
    const outPath = path.join(outDir, t.out);
    await sharp(srcSvg, { density: Math.max(512, t.size) })
      .resize(t.size, t.size)
      .png({ compressionLevel: 9 })
      .toFile(outPath);
    console.log(`Generated ${outPath}`);
  }
}

buildPngs().catch((err) => {
  console.error('Failed to generate icons:', err);
  process.exit(1);
});
