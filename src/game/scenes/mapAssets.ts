/**
 * Baked map asset registry (spec 07 §7 — code references assets by id).
 *
 * The single place that maps `SceneSpec.tilemap` ids to the bundled
 * Tiled JSON. Adding a map = bake it + register it here; scenes and
 * screens never import map JSON directly.
 *
 * @packageDocumentation
 */

import act1OverworldJson from '../../../assets/tilemaps/act1_overworld.json';
import act1RoomJson from '../../../assets/tilemaps/act1_area1_room1.json';
import demoGladeJson from '../../../assets/tilemaps/demo_glade.json';
import type { TileMapData } from '@/game/render/tiles/TileMap';

/** Stable map asset ids (must match the bake output `name` fields). */
export const MAP_IDS = {
  demoGlade: 'demo_glade',
  act1Overworld: 'act1_overworld',
  act1Area1Room1: 'act1_area1_room1',
} as const;

/** All registered map assets, keyed by id. */
const MAP_ASSETS: Readonly<Record<string, TileMapData>> = {
  [MAP_IDS.demoGlade]: demoGladeJson as TileMapData,
  [MAP_IDS.act1Overworld]: act1OverworldJson as TileMapData,
  [MAP_IDS.act1Area1Room1]: act1RoomJson as TileMapData,
};

/** Resolve a map id to its Tiled JSON. Throws on unknown ids. */
export function resolveTilemap(id: string): TileMapData {
  const asset = MAP_ASSETS[id];
  if (!asset) {
    throw new Error(
      `mapAssets: unknown tilemap id "${id}" — bake it (npm run assets:bake) and register it in mapAssets.ts`,
    );
  }
  return asset;
}
