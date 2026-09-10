/**
 * Atlas registry — the runtime index over the baked atlas manifests
 * (spec 12 §4.4, spec 07 §6.1).
 *
 * The bake step (`npm run assets:bake`) emits one JSON manifest per
 * atlas next to its PNG. This module `require()`s those manifests at
 * module load (synchronous — they are bundled) and exposes O(1)
 * lookups:
 *
 *  - `frameRectOf(atlasId, spriteId)` — src rect inside the atlas PNG;
 *  - `frameSizeOf` — the engine's {@link FrameSizeLookup} adapter;
 *  - `animationManifestOf(atlasId)` — the `AnimationTable` seed;
 *  - `tileEntries(atlasId)` — tileset order (name + solidity) so the
 *    scene can build collision GID sets without hardcoding names.
 *
 * Code references assets by id only (spec 07 §7) — the ids here are
 * pinned to the bake output by `__tests__/assets/atlasManifest.test.ts`.
 *
 * PNG bytes are intentionally NOT loaded here (see `atlasImages.ts`) so
 * engine-side consumers and jest tests never pull image assets.
 *
 * @packageDocumentation
 */

import atlasHeroJson from '../../../../assets/sprites/atlas_hero.json';
import atlasTilesJson from '../../../../assets/sprites/atlas_tiles.json';

import type { AnimationManifest } from '@/game/engine/animation/AnimationTable';
import type { FrameSizeLookup } from '@/game/engine/render/spriteCommands';

/** Stable atlas ids (must match the bake output `atlas` field). */
export const ATLAS_IDS = {
  hero: 'atlas_hero',
  tiles: 'atlas_tiles',
} as const;

/** Any registered atlas id. */
export type AtlasId = (typeof ATLAS_IDS)[keyof typeof ATLAS_IDS];

/** Source rect of one frame inside its atlas PNG. */
export interface AtlasFrameRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** One entry of a tileset manifest (manifest order = tileset-local id). */
export interface TileEntry {
  readonly name: string;
  readonly solid: boolean;
}

/** Shape of the baked atlas JSON manifests (superset per atlas). */
interface RawAtlasManifest {
  readonly atlas: string;
  readonly frameWidth: number;
  readonly frameHeight: number;
  readonly width: number;
  readonly height: number;
  readonly frames: readonly AtlasFrameRect[];
  readonly animations?: unknown;
  readonly tiles?: readonly TileEntry[];
}

/** Everything the runtime needs about one atlas (minus image bytes). */
export interface AtlasRecord {
  readonly id: AtlasId;
  /** Frame rect per sprite id. */
  readonly framesByName: ReadonlyMap<string, AtlasFrameRect>;
  /** Animation table seed (hero atlas only; tiles atlas has none). */
  readonly animations: AnimationManifest;
  /** Tileset entries in tileset-local-id order (tiles atlas only). */
  readonly tiles: readonly TileEntry[];
}

// ---------------------------------------------------------------------------
// Manifest loading + validation (fail loudly at boot, not mid-frame)
// ---------------------------------------------------------------------------

function loadAtlas(raw: unknown, expectedId: AtlasId): AtlasRecord {
  const manifest = raw as RawAtlasManifest;
  if (manifest.atlas !== expectedId) {
    throw new Error(
      `atlasRegistry: manifest says "${manifest.atlas}" but code expects "${expectedId}" — rebake the assets (npm run assets:bake)`,
    );
  }
  if (!Array.isArray(manifest.frames) || manifest.frames.length === 0) {
    throw new Error(`atlasRegistry: atlas "${expectedId}" has no frames`);
  }

  const framesByName = new Map<string, AtlasFrameRect>();
  for (const frame of manifest.frames) {
    framesByName.set(frame.name, frame);
  }

  return {
    id: expectedId,
    framesByName,
    animations: (manifest.animations ?? {}) as AnimationManifest,
    tiles: manifest.tiles ?? [],
  };
}

/** All registered atlases, keyed by id. */
const REGISTRY: Readonly<Record<string, AtlasRecord>> = Object.freeze({
  [ATLAS_IDS.hero]: loadAtlas(atlasHeroJson, ATLAS_IDS.hero),
  [ATLAS_IDS.tiles]: loadAtlas(atlasTilesJson, ATLAS_IDS.tiles),
});

/** Look up an atlas record by id. */
export function getAtlas(id: string): AtlasRecord | undefined {
  return REGISTRY[id];
}

/** Resolve a frame's src rect. `undefined` when the id is unknown. */
export function frameRectOf(atlasId: string, spriteId: string): AtlasFrameRect | undefined {
  return getAtlas(atlasId)?.framesByName.get(spriteId);
}

/** {@link FrameSizeLookup} adapter over the registry. */
export const frameSizeOf: FrameSizeLookup = (atlasId, spriteId) => {
  const rect = frameRectOf(atlasId, spriteId);
  return { width: rect?.width ?? 0, height: rect?.height ?? 0 };
};

/** Animation manifest for one atlas (empty for atlases without animations). */
export function animationManifestOf(atlasId: string): AnimationManifest {
  return getAtlas(atlasId)?.animations ?? {};
}

/** Tileset entries (name + solidity) in tileset-local-id order. */
export function tileEntries(atlasId: string): readonly TileEntry[] {
  return getAtlas(atlasId)?.tiles ?? [];
}
