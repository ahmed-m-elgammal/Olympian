/**
 * QA preview — renders the generated atlases into a labelled grid so
 * the art can be reviewed frame-by-frame. Not part of the bake; run
 * manually: npx ts-node --project tsconfig.scripts.json scripts/preview-sprites.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { encodePng, type Raster } from './sprites/png';

const PREVIEW_DIR = join(__dirname, 'preview');
const SCALE = 8;

function upscale(raster: Raster, factor: number): Raster {
  const { width, height, data } = raster;
  const out = new Uint8Array(width * factor * height * factor * 4);
  for (let y = 0; y < height * factor; y++) {
    for (let x = 0; x < width * factor; x++) {
      const src = (Math.floor(y / factor) * width + Math.floor(x / factor)) * 4;
      const dst = (y * width * factor + x) * 4;
      out[dst] = data[src];
      out[dst + 1] = data[src + 1];
      out[dst + 2] = data[src + 2];
      out[dst + 3] = data[src + 3] === 0 ? 255 : data[src + 3];
      // Show transparency as a checker so silhouettes are obvious.
      if (data[src + 3] === 0) {
        const checker = (Math.floor(x / factor / 2) + Math.floor(y / factor / 2)) % 2 === 0;
        out[dst] = checker ? 0x22 : 0x18;
        out[dst + 1] = checker ? 0x22 : 0x18;
        out[dst + 2] = checker ? 0x2e : 0x20;
        out[dst + 3] = 255;
      }
    }
  }
  return { width: width * factor, height: height * factor, data: out };
}

/** Pack rows of frames into one image. */
function grid(rowsOfFrames: Raster[][], pad: number): Raster {
  const cellW = Math.max(...rowsOfFrames.flat().map((f) => f.width));
  const cellH = Math.max(...rowsOfFrames.flat().map((f) => f.height));
  const cols = Math.max(...rowsOfFrames.map((r) => r.length));
  const w = cols * (cellW + pad) + pad;
  const h = rowsOfFrames.length * (cellH + pad) + pad;
  const data = new Uint8Array(w * h * 4);
  const bg = (x: number, y: number): number => {
    const checker = (Math.floor(x / 16) + Math.floor(y / 16)) % 2 === 0;
    return checker ? 0x24243a : 0x181826;
  };
  for (let i = 0; i < w * h; i++) {
    const c = bg(i % w, Math.floor(i / w));
    data[i * 4] = (c >> 16) & 0xff;
    data[i * 4 + 1] = (c >> 8) & 0xff;
    data[i * 4 + 2] = c & 0xff;
    data[i * 4 + 3] = 255;
  }
  rowsOfFrames.forEach((row, ry) => {
    row.forEach((f, rx) => {
      const ox = pad + rx * (cellW + pad);
      const oy = pad + ry * (cellH + pad);
      for (let y = 0; y < f.height; y++) {
        for (let x = 0; x < f.width; x++) {
          const src = (y * f.width + x) * 4;
          if (f.data[src + 3] === 0) continue;
          const dst = ((oy + y) * w + ox + x) * 4;
          data[dst] = f.data[src];
          data[dst + 1] = f.data[src + 1];
          data[dst + 2] = f.data[src + 2];
          data[dst + 3] = 255;
        }
      }
    });
  });
  return { width: w, height: h, data };
}

function main(): void {
  mkdirSync(PREVIEW_DIR, { recursive: true });

  // ---- Hero grid (regenerated deterministically) ----
  const { buildHeroArt } = require('./sprites/heroArt') as typeof import('./sprites/heroArt');
  const hero = buildHeroArt();
  const rowsOf: Raster[][] = [];
  const keyOrder = [
    'hero_idle_down', 'hero_idle_up', 'hero_idle_left', 'hero_idle_right',
    'hero_walk_down', 'hero_walk_up', 'hero_walk_left', 'hero_walk_right',
    'hero_attack_down', 'hero_hit_down', 'hero_death_down',
  ];
  const byKey = new Map<string, Raster[]>();
  for (const key of keyOrder) byKey.set(key, []);
  for (const f of hero.frames) {
    const key = f.name.replace(/_\d+$/, '');
    byKey.get(key)?.push(f.raster);
  }
  for (const key of keyOrder) rowsOf.push(byKey.get(key) ?? []);
  writeFileSync(
    join(PREVIEW_DIR, 'hero_grid.png'),
    encodePng(upscale(grid(rowsOf, 4), SCALE)),
  );

  // ---- Tiles row ----
  const { buildTileset } = require('./sprites/tileArt') as typeof import('./sprites/tileArt');
  const tiles = buildTileset();
  writeFileSync(
    join(PREVIEW_DIR, 'tiles_row.png'),
    encodePng(upscale(grid([tiles.map((t) => t.raster)], 4), SCALE)),
  );

  console.log('[preview-sprites] wrote hero_grid.png / tiles_row.png');
}

main();
