/**
 * Bake-output contract tests (spec 12 §4.4, tasks P2.E1.T1–T3).
 *
 * Pins `assets/sprites/atlas_hero.json` and `atlas_tiles.json` to the
 * shape the runtime expects: frame inventory, animation tables, fps,
 * loop flags, tileset solidity. A rebake that breaks this file breaks
 * CI — the atlas registry and the hero def both rely on it.
 */

import atlasHero from '../../assets/sprites/atlas_hero.json';
import atlasTiles from '../../assets/sprites/atlas_tiles.json';

import {
  HERO_LOCOMOTION_FPS,
  HERO_ANIM_KEYS,
} from '../../scripts/sprites/heroArt';

interface ManifestAnimation {
  frames: string[];
  fps: number;
  loop: boolean;
}

interface HeroManifest {
  atlas: string;
  frameWidth: number;
  frameHeight: number;
  width: number;
  height: number;
  frames: Array<{ name: string; x: number; y: number; width: number; height: number }>;
  animations: Record<string, ManifestAnimation>;
}

interface TilesManifest {
  atlas: string;
  frameWidth: number;
  frameHeight: number;
  width: number;
  height: number;
  frames: Array<{ name: string; x: number; y: number; width: number; height: number }>;
  tiles: Array<{ name: string; solid: boolean }>;
  animations?: Record<string, ManifestAnimation>;
}

const hero = atlasHero as unknown as HeroManifest;
const tiles = atlasTiles as unknown as TilesManifest;

describe('atlas_hero manifest', () => {
  it('declares the expected atlas id and 16×24 frames in a power-of-two atlas', () => {
    expect(hero.atlas).toBe('atlas_hero');
    expect(hero.frameWidth).toBe(16);
    expect(hero.frameHeight).toBe(24);
    expect(hero.width).toBe(hero.height);
    expect([256, 512, 1024]).toContain(hero.width);
  });

  it('ships exactly the spec frame inventory (49 frames)', () => {
    expect(hero.frames.length).toBe(49);
  });

  it('frames are in-bounds inside the atlas image', () => {
    for (const f of hero.frames) {
      expect(f.width).toBe(hero.frameWidth);
      expect(f.height).toBe(hero.frameHeight);
      expect(f.x + f.width).toBeLessThanOrEqual(hero.width);
      expect(f.y + f.height).toBeLessThanOrEqual(hero.height);
    }
  });

  it('defines all 11 P2.E1 animations', () => {
    const expected = [
      HERO_ANIM_KEYS.idleDown,
      HERO_ANIM_KEYS.idleUp,
      HERO_ANIM_KEYS.idleLeft,
      HERO_ANIM_KEYS.idleRight,
      HERO_ANIM_KEYS.walkDown,
      HERO_ANIM_KEYS.walkUp,
      HERO_ANIM_KEYS.walkLeft,
      HERO_ANIM_KEYS.walkRight,
      HERO_ANIM_KEYS.attack,
      HERO_ANIM_KEYS.hit,
      HERO_ANIM_KEYS.death,
    ];
    for (const key of expected) {
      expect(hero.animations[key]).toBeDefined();
    }
    expect(Object.keys(hero.animations).length).toBe(11);
  });

  it('idle: 4 frames × 4 directions, looping at 8fps (P2.E1 AC)', () => {
    for (const key of Object.values(HERO_ANIM_KEYS).filter((k) => k.includes('idle'))) {
      const anim = hero.animations[key];
      expect(anim.frames.length).toBe(4);
      expect(anim.fps).toBe(HERO_LOCOMOTION_FPS);
      expect(anim.loop).toBe(true);
    }
  });

  it('walk: 6 frames × 4 directions, looping at 8fps (P2.E1 AC)', () => {
    for (const key of Object.values(HERO_ANIM_KEYS).filter((k) => k.includes('walk'))) {
      const anim = hero.animations[key];
      expect(anim.frames.length).toBe(6);
      expect(anim.fps).toBe(HERO_LOCOMOTION_FPS);
      expect(anim.loop).toBe(true);
    }
  });

  it('action animations: attack 3@12, hit 2@10, death 4@6, all non-looping', () => {
    expect(hero.animations[HERO_ANIM_KEYS.attack]).toEqual({
      frames: expect.arrayContaining([expect.stringMatching(/^hero_attack_down_\d$/)]),
      fps: 12,
      loop: false,
    });
    expect(hero.animations[HERO_ANIM_KEYS.attack].frames.length).toBe(3);
    expect(hero.animations[HERO_ANIM_KEYS.hit].frames.length).toBe(2);
    expect(hero.animations[HERO_ANIM_KEYS.hit].fps).toBe(10);
    expect(hero.animations[HERO_ANIM_KEYS.hit].loop).toBe(false);
    expect(hero.animations[HERO_ANIM_KEYS.death].frames.length).toBe(4);
    expect(hero.animations[HERO_ANIM_KEYS.death].fps).toBe(6);
    expect(hero.animations[HERO_ANIM_KEYS.death].loop).toBe(false);
  });

  it('every animation frame name resolves to a real atlas frame', () => {
    const names = new Set(hero.frames.map((f) => f.name));
    for (const [, anim] of Object.entries(hero.animations)) {
      for (const frameName of anim.frames) {
        expect(names.has(frameName)).toBe(true);
      }
      // Manifest frame lists never alias each other.
      expect(new Set(anim.frames).size).toBe(anim.frames.length);
    }
  });
});

describe('atlas_tiles manifest', () => {
  it('declares the tiles atlas with 16×16 frames', () => {
    expect(tiles.atlas).toBe('atlas_tiles');
    expect(tiles.frameWidth).toBe(16);
    expect(tiles.frameHeight).toBe(16);
    expect(tiles.width).toBe(tiles.height);
  });

  it('declares solidity for every tile and resolves its frame rect', () => {
    expect(tiles.tiles.length).toBe(tiles.frames.length);
    const frameNames = new Set(tiles.frames.map((f) => f.name));
    for (const tile of tiles.tiles) {
      expect(frameNames.has(tile.name)).toBe(true);
      expect(typeof tile.solid).toBe('boolean');
    }
  });

  it('the solid set covers props + border cliffs (walkable floor stays clear)', () => {
    const solid = tiles.tiles.filter((t) => t.solid).map((t) => t.name);
    expect(solid.sort()).toEqual([
      'bush',
      'cliff_0',
      'cliff_1',
      'pond_0',
      'pond_1',
      'rock',
      'ruin_column',
      'stone_wall',
      'tree_oak',
      'tree_olive',
      'tree_pine',
    ]);
  });

  it('ships the 3 marker animations (shrine / brazier / portal), looping', () => {
    const anims = tiles.animations!;
    const frameNames = new Set(tiles.frames.map((f) => f.name));
    for (const key of ['marker_shrine', 'marker_brazier', 'marker_portal']) {
      const anim = anims[key];
      expect(anim).toBeDefined();
      expect(anim.frames.length).toBeGreaterThanOrEqual(4);
      expect(anim.fps).toBeGreaterThan(0);
      expect(anim.loop).toBe(true);
      for (const frameName of anim.frames) {
        expect(frameNames.has(frameName)).toBe(true);
      }
    }
    // Shrine frames are ordered gem-pulse states (dim → bright → sparkle).
    expect(anims.marker_shrine.frames[0]).toBe('shrine_0');
    expect(anims.marker_shrine.frames[2]).toBe('shrine_2');
  });
});
