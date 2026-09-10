/**
 * Scene z-layers (spec 07 §3.2 `layer` / DrawCommand `zIndex`).
 *
 * Draw commands are sorted by `layer` ascending (back → front). Layers
 * are spaced by 10 so insertions never require renumbering.
 *
 * @packageDocumentation
 */

export const LAYERS = {
  /** Ground tiles. */
  ground: 0,
  /** Flat decals (paths, shadows, scorch marks). */
  decal: 10,
  /** World props (props, chests, markers). */
  props: 20,
  /** Actors (hero, enemies, companions, NPCs). */
  actors: 40,
  /** Overhead geometry (tree canopies, arches). */
  overhead: 60,
  /** In-world FX (particles, slash arcs). */
  fx: 80,
} as const;

export type LayerKey = keyof typeof LAYERS;
