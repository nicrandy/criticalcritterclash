/**
 * make-logo-transparent.mjs
 * Replaces white / near-white pixels in logo.png with transparency.
 * Usage: node scripts/make-logo-transparent.mjs
 */

import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');
const LOGO_PATH = path.join(ROOT, 'images', 'product_images', 'logo.png');

// How close to pure white a pixel must be to become transparent.
// 235 catches off-white anti-alias fringing too.
const THRESHOLD = 235;

async function main() {
  console.log('🖼  Loading logo…');
  const buf = await readFile(LOGO_PATH);
  const img = await loadImage(buf);

  const { width, height } = img;
  const canvas = createCanvas(width, height);
  const ctx    = canvas.getContext('2d');

  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, width, height);
  const data      = imageData.data; // Uint8ClampedArray, 4 bytes per pixel

  let changed = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    if (r >= THRESHOLD && g >= THRESHOLD && b >= THRESHOLD) {
      // Soft-fade anti-aliased edges instead of hard cut
      const whiteness = Math.min(r, g, b);
      const alpha     = Math.round((255 - whiteness) * (255 / (255 - THRESHOLD)));
      data[i + 3]     = Math.min(data[i + 3], alpha);
      changed++;
    }
  }

  ctx.putImageData(imageData, 0, 0);

  const outBuf = canvas.toBuffer('image/png');
  await writeFile(LOGO_PATH, outBuf);

  console.log(`✅  Done — ${changed.toLocaleString()} pixels made transparent.`);
  console.log(`   Saved → ${LOGO_PATH}`);
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
