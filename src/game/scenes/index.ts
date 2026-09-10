/**
 * Barrel for scenes (spec 07 §5).
 */

export { createDemoGladeScene, DEMO_SPAWN_TILE } from './demoGlade/demoGladeScene';
export type {
  DemoGladeScene,
  DemoGladeSceneOptions,
} from './demoGlade/demoGladeScene';
export {
  createFieldSceneBuilder,
  snapCameraTo,
} from './fieldScene';
export type { FieldSceneDeps } from './fieldScene';
export { MAP_IDS, resolveTilemap } from './mapAssets';
export { markerTargetRoute } from './markerRouting';
export type { MarkerRoute } from './markerRouting';
export {
  SCENE_IDS,
  LEVEL_IDS,
  LEVEL_TITLE_KEYS,
  LEVEL_ACTS,
  ACT0_MUSIC,
  ACT0_AMBIENCE,
  MARKER_SPRITES,
  overworldSpecForAct,
  overworldSceneIdForAct,
  levelSpec,
  entitiesFromMapObjects,
} from './act1/act1Scenes';
