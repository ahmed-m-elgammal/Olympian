/**
 * Atlas image sources — Metro asset handles for the baked atlas PNGs.
 *
 * Split from `atlasRegistry.ts` so engine-side code (and jest) can use
 * the manifests without pulling binary image assets. Only the Skia
 * render layer (`DrawListRenderer`) imports this module, passing the
 * sources to `useImage()`.
 *
 * @packageDocumentation
 */

import { ATLAS_IDS, type AtlasId } from './atlasRegistry';

/** Metro asset modules keyed by atlas id (`require()` returns a number). */
export const ATLAS_IMAGE_SOURCES: Readonly<Record<AtlasId, number>> = Object.freeze({
  [ATLAS_IDS.hero]: require('../../../../assets/sprites/atlas_hero.png'),
  [ATLAS_IDS.tiles]: require('../../../../assets/sprites/atlas_tiles.png'),
});
