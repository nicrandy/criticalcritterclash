/**
 * Critical Critter Image Processor
 * ----------------------------------
 * Reads raw images, stamps stat numbers into each card's stat boxes, saves to product_images/.
 * Usage:  node scripts/process-critters.mjs
 */

import { createCanvas, loadImage } from '@napi-rs/canvas';
import { readFile, writeFile, mkdir, readdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..');
const RAW_DIR   = path.join(ROOT, 'images', 'raw');
const OUT_DIR   = path.join(ROOT, 'images', 'product_images');

const CRITTER_STATS = {
  'legendary-jackalope.png':    { strength: 9, health: 7, stamina: 6, rarity: 'legendary' },
  'unique-shadow-pack.png':     { strength: 7, health: 8, stamina: 7, rarity: 'unique'    },
  'unique-crystal-squirrel.png':{ strength: 4, health: 5, stamina: 9, rarity: 'unique'    },
  'rare-fox.png':               { strength: 5, health: 6, stamina: 7, rarity: 'rare'      },
  'rare-frost-pack.png':        { strength: 6, health: 7, stamina: 6, rarity: 'rare'      },
  'rare-bear-pack.png':         { strength: 7, health: 8, stamina: 5, rarity: 'rare'      },
};

const RARITY_COLOR = {
  legendary: '#c9a84c',
  unique:    '#cc44ff',
  rare:      '#4488ff',
};

// X positions of the three stat boxes as fraction of image width
const STAT_X_PCTS  = [0.195, 0.500, 0.806];
const NUMBER_Y_PCT = 0.895;

async function processImage(filename) {
  const stats = CRITTER_STATS[filename];
  const inputPath  = path.join(RAW_DIR, filename);
  const outputPath = path.join(OUT_DIR, filename);

  console.log(`🐾  ${filename}`);

  const buf = await readFile(inputPath);
  const img = await loadImage(buf);
  const { width, height } = img;

  const canvas = createCanvas(width, height);
  const ctx    = canvas.getContext('2d');

  // Draw original image
  ctx.drawImage(img, 0, 0);

  // Stamp the three numbers
  const values   = [stats.strength, stats.health, stats.stamina];
  const color    = RARITY_COLOR[stats.rarity] ?? '#ffffff';
  const fontSize = Math.round(width * 0.10);
  const cy       = Math.round(height * NUMBER_Y_PCT);

  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.font         = `900 ${fontSize}px "Arial Black", Arial, sans-serif`;

  for (let i = 0; i < 3; i++) {
    const cx  = Math.round(width * STAT_X_PCTS[i]);
    const txt = String(values[i]);

    // Black outline
    ctx.lineWidth   = Math.round(fontSize * 0.22);
    ctx.strokeStyle = '#000000';
    ctx.lineJoin    = 'round';
    ctx.strokeText(txt, cx, cy);

    // Coloured fill
    ctx.fillStyle = color;
    ctx.fillText(txt, cx, cy);
  }

  const outBuf = canvas.toBuffer('image/png');
  await writeFile(outputPath, outBuf);
  console.log(`   ✅  STR ${values[0]}  HP ${values[1]}  STA ${values[2]}  → product_images/${filename}`);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const files     = await readdir(RAW_DIR).catch(() => []);
  const toProcess = files.filter(f => CRITTER_STATS[f]);

  if (!toProcess.length) {
    console.log('No matching images found in images/raw/');
    return;
  }

  console.log(`\n⚔  Processing ${toProcess.length} critters...\n`);
  for (const file of toProcess) {
    try   { await processImage(file); }
    catch (e) { console.error(`   ❌  ${file}: ${e.message}`); }
  }
  console.log('\n🎉  Done!\n');
}

main();
