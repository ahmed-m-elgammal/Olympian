/**
 * Act 1 scene integration (P2.E2.T5–T8): the scene specs assemble into
 * playable worlds — hero on the map spawn, animated markers as
 * entities, walking onto a marker focuses it through the sink, and the
 * routing table resolves the hub → overworld → level → overworld loop
 * (the P2.E2 acceptance path, spec 06 §1).
 */

import atlasTiles from '../../assets/sprites/atlas_tiles.json';

import type { DrawCommand } from '@/game/engine/render/DrawCommand';
import type { CameraTransform } from '@/game/render/canvas/Camera';
import type { FocusedMarker, MarkerFocusSink, SceneSpec } from '@/game/engine';
import { createFieldSceneBuilder, resolveTilemap } from '@/game/scenes';
import {
  LEVEL_IDS,
  levelSpec,
  markerTargetRoute,
  overworldSpecForAct,
  overworldSceneIdForAct,
} from '@/game/scenes';
import { TileCollisionSpace } from '@/game/engine/systems/collision';
import { TileMap } from '@/game/render/tiles/TileMap';
import { MAP_IDS } from '@/game/scenes';

const DT = 1 / 60;

interface FocusSpy extends MarkerFocusSink {
  focused: FocusedMarker[];
  blurs: number;
}

function makeFocusSpy(): FocusSpy {
  const spy = {
    focused: [] as FocusedMarker[],
    blurs: 0,
    focus: (m: FocusedMarker) => spy.focused.push(m),
    blur: () => spy.blurs++,
  };
  return spy;
}

function makeBuilder(spy: MarkerFocusSink) {
  return createFieldSceneBuilder({
    resolveTilemap,
    focusSink: spy,
    inputSource: { getMove: () => ({ x: 0, y: 0 }) },
    publish: (_commands: readonly DrawCommand[], _camera: CameraTransform) => undefined,
  });
}

describe('Act 1 scene specs', () => {
  it('act 0 maps to the authored overworld; other acts are rejected', () => {
    expect(overworldSceneIdForAct(0)).toBe('act1_overworld');
    expect(() => overworldSceneIdForAct(1)).toThrow();
    expect(() => overworldSpecForAct(1)).toThrow();
  });

  it('the overworld spec carries 8 puzzle + boss + portal entities from the map', () => {
    const spec = overworldSpecForAct(0);
    expect(spec.type).toBe('overworld');
    expect(spec.id).toBe('act1_overworld');
    expect(spec.tilemap).toBe(MAP_IDS.act1Overworld);
    expect(spec.music).toBe('tutorial');
    expect(spec.ambience).toBe('amb_act1');

    const markers = spec.entities.filter((e) => e.kind === 'marker');
    expect(markers).toHaveLength(10);
    const kinds = markers.map((m) => (m as { markerKind: string }).markerKind);
    expect(kinds.filter((k) => k === 'puzzle')).toHaveLength(8);
    expect(kinds.filter((k) => k === 'boss')).toHaveLength(1);
    expect(kinds.filter((k) => k === 'portal')).toHaveLength(1);
  });

  it('the room spec carries the exit portal; unknown levels throw', () => {
    const spec = levelSpec(LEVEL_IDS.act1Area1Room1);
    expect(spec.type).toBe('level');
    const markers = spec.entities.filter((e) => e.kind === 'marker');
    expect(markers).toHaveLength(1);
    expect((markers[0] as { target: string }).target).toBe('overworld');
    expect(() => levelSpec('act9_area9_room9')).toThrow();
  });

  it('marker routing resolves the full core-loop graph', () => {
    expect(markerTargetRoute('puzzle', 'act1_area1_room1')).toEqual({
      screen: 'Level',
      levelId: 'act1_area1_room1',
    });
    expect(markerTargetRoute('boss', 'nemean_lion')).toEqual({
      screen: 'Boss',
      bossId: 'nemean_lion',
    });
    expect(markerTargetRoute('portal', 'hub')).toEqual({ screen: 'Hub' });
    expect(markerTargetRoute('portal', 'overworld')).toEqual({ screen: 'Overworld' });
  });
});

describe('Act 1 overworld world assembly', () => {
  function build(spec: SceneSpec) {
    const spy = makeFocusSpy();
    const handle = makeBuilder(spy)(spec);
    return { spy, handle };
  }

  it('spawns the hero at the map spawn and 10 animated markers', () => {
    const spec = overworldSpecForAct(0);
    const { handle } = build(spec);

    expect(handle.entityIds).toHaveLength(11); // hero + 10 markers
    const heroPos = handle.gameWorld.ecs.getComponent(handle.entityIds[0], 'position')!;
    expect(heroPos.x).toBe(spec.playerSpawn.x);
    expect(heroPos.y).toBe(spec.playerSpawn.y);

    // Hero feet on a non-solid tile (the spawn stone is walkable).
    const map = new TileMap(resolveTilemap(MAP_IDS.act1Overworld));
    const firstgid = map.tilesets[0]?.firstgid ?? 1;
    const solidGids = new Set(
      atlasTiles.tiles
        .map((t, index) => (t.solid ? firstgid + index : -1))
        .filter((g) => g > 0),
    );
    const collision = new TileCollisionSpace(map, solidGids, 'obstacles');
    expect(
      collision.intersectsSolid({ x: heroPos.x - 5, y: heroPos.y - 8, width: 10, height: 8 }),
    ).toBe(false);
  });

  it('marker entities carry looping animations that resolve in the table', () => {
    const spec = overworldSpecForAct(0);
    const { handle } = build(spec);
    const ecs = handle.gameWorld.ecs;

    const shrine = handle.entityIds
      .map((id) => ecs.getComponent(id, 'marker'))
      .find((m) => m?.markerId === 'puzzle_1');
    expect(shrine).toBeDefined();

    const shrineEntity = handle.entityIds.find(
      (id) => ecs.getComponent(id, 'marker')?.markerId === 'puzzle_1',
    )!;
    const anim = ecs.getComponent(shrineEntity, 'animation')!;
    expect(anim.current).toBe('marker_shrine');
    expect(anim.loop).toBe(true);
    expect(handle.animations.has('marker_shrine')).toBe(true);

    // The AnimationSystem advances the loop: 0.8s in (float-safe past
    // the 750ms frame-3 boundary), the sprite has left frame 0 and the
    // gem pulse is verifiably animating.
    const before = ecs.getComponent(shrineEntity, 'sprite')!.spriteId;
    for (let i = 0; i < 48; i++) handle.gameWorld.step(DT);
    const after = ecs.getComponent(shrineEntity, 'sprite')!.spriteId;
    expect(after).not.toBe(before);
    expect(after).toMatch(/^shrine_[123]$/);
  });

  it('walking the hero onto a puzzle marker focuses it through the sink', () => {
    const spec = overworldSpecForAct(0);
    const { spy, handle } = build(spec);
    const ecs = handle.gameWorld.ecs;

    // Teleport the hero onto puzzle_1's feet anchor and step once.
    const puzzle1 = spec.entities.find(
      (e) => e.kind === 'marker' && e.markerId === 'puzzle_1',
    ) as { x: number; y: number };
    const heroId = handle.entityIds[0];
    ecs.getComponent(heroId, 'position')!.x = puzzle1.x;
    ecs.getComponent(heroId, 'position')!.y = puzzle1.y;

    handle.gameWorld.step(DT);

    expect(spy.focused).toHaveLength(1);
    expect(spy.focused[0]!.markerId).toBe('puzzle_1');
    expect(spy.focused[0]!.kind).toBe('puzzle');
    expect(spy.focused[0]!.labelKey).toBe('acts:act_0.markers.puzzle_1');

    // Walk away → blur.
    ecs.getComponent(heroId, 'position')!.x += 500;
    handle.gameWorld.step(DT);
    expect(spy.blurs).toBe(1);
  });

  it('the level room focuses its exit portal the same way', () => {
    const spec = levelSpec(LEVEL_IDS.act1Area1Room1);
    const spy = makeFocusSpy();
    const handle = makeBuilder(spy)(spec);
    const ecs = handle.gameWorld.ecs;

    const exit = spec.entities.find((e) => e.kind === 'marker') as { x: number; y: number };
    const heroId = handle.entityIds[0];
    ecs.getComponent(heroId, 'position')!.x = exit.x;
    ecs.getComponent(heroId, 'position')!.y = exit.y;

    handle.gameWorld.step(DT);

    expect(spy.focused).toHaveLength(1);
    expect(spy.focused[0]!.target).toBe('overworld');
    expect(markerTargetRoute('portal', spy.focused[0]!.target)).toEqual({ screen: 'Overworld' });
  });

  it('spec markers resolve the same world-space anchors the maps bake', () => {
    // Cross-layer consistency: the spec's puzzle_1 anchor sits at the
    // center-bottom of its baked object cell.
    const map = new TileMap(resolveTilemap(MAP_IDS.act1Overworld));
    const obj = map
      .getObjects('objects')
      .find((o) => o.name === 'puzzle_1')!;
    const spec = overworldSpecForAct(0);
    const entity = spec.entities.find(
      (e) => e.kind === 'marker' && e.markerId === 'puzzle_1',
    ) as { x: number; y: number };

    expect(entity.x).toBe(obj.x + 8);
    expect(entity.y).toBe(obj.y + 16);
  });
});
