/**
 * MarkerSystem tests (P2.E2.T4): proximity focus, nearest-wins, blur on
 * leave, and the no-player edge. The sink is a spy — the same seam the
 * interactionStore adapter implements in the app.
 */

import { World } from '@/game/engine/ecs/World';
import { createMarkerSystem, type FocusedMarker, type MarkerFocusSink } from '@/game/engine/systems/MarkerSystem';
import type { System } from '@/game/engine/systems';

const DT = 1 / 60;

function makeSink(): {
  sink: MarkerFocusSink;
  focused: FocusedMarker[];
  counts: { focus: number; blur: number };
} {
  const focused: FocusedMarker[] = [];
  const counts = { focus: 0, blur: 0 };
  return {
    sink: {
      focus: (m) => {
        focused.push(m);
        counts.focus++;
      },
      blur: () => {
        counts.blur++;
      },
    },
    focused,
    counts,
  };
}

/** Player at (px, py) + one marker at (mx, my) with the given radius. */
function makeWorld(
  player: { x: number; y: number },
  markers: Array<{ id: string; x: number; y: number; radius: number; kind?: 'puzzle' | 'boss' | 'portal' }>,
): World {
  const world = new World();
  const player0 = world.createEntity();
  world.addComponent(player0, 'position', { x: player.x, y: player.y });
  world.addComponent(player0, 'playerControlled', { playerId: 'hero' });

  for (const m of markers) {
    const id = world.createEntity();
    world.addComponent(id, 'position', { x: m.x, y: m.y });
    world.addComponent(id, 'marker', {
      markerId: m.id,
      kind: m.kind ?? 'puzzle',
      target: 'act1_area1_room1',
      labelKey: 'acts:act_0.markers.puzzle_1',
      radiusPx: m.radius,
      playerInFocus: false,
    });
  }
  return world;
}

describe('MarkerSystem', () => {
  it('focuses the marker when the player walks into its radius', () => {
    const { sink, focused, counts } = makeSink();
    const system: System = createMarkerSystem(sink);
    const world = makeWorld({ x: 0, y: 0 }, [{ id: 'puzzle_1', x: 10, y: 0, radius: 26 }]);

    system(world, DT);

    expect(focused).toHaveLength(1);
    expect(focused[0]).toMatchObject({ markerId: 'puzzle_1', kind: 'puzzle', target: 'act1_area1_room1' });
    expect(counts.blur).toBe(0);
    const marker = world.query('marker')[0];
    expect(world.getComponent(marker, 'marker')!.playerInFocus).toBe(true);
  });

  it('does not focus while the player is outside the radius', () => {
    const { sink, focused } = makeSink();
    const system = createMarkerSystem(sink);
    const world = makeWorld({ x: 0, y: 0 }, [{ id: 'puzzle_1', x: 50, y: 0, radius: 26 }]);

    system(world, DT);

    expect(focused).toHaveLength(0);
    const marker = world.query('marker')[0];
    expect(world.getComponent(marker, 'marker')!.playerInFocus).toBe(false);
  });

  it('blurs exactly once when the player walks away', () => {
    const { sink, focused, counts } = makeSink();
    const system = createMarkerSystem(sink);
    const world = makeWorld({ x: 0, y: 0 }, [{ id: 'puzzle_1', x: 10, y: 0, radius: 26 }]);

    system(world, DT); // focus
    const pos = world.getComponent(world.query('playerControlled')[0], 'position')!;
    pos.x = 100; // walk away
    system(world, DT); // blur

    expect(focused).toHaveLength(1);
    expect(counts.blur).toBe(1);

    // Staying away does not re-blur.
    system(world, DT);
    expect(counts.blur).toBe(1);
  });

  it('keeps focus while the marker stays in range (no spam)', () => {
    const { sink, focused } = makeSink();
    const system = createMarkerSystem(sink);
    const world = makeWorld({ x: 0, y: 0 }, [{ id: 'puzzle_1', x: 10, y: 0, radius: 26 }]);

    for (let i = 0; i < 10; i++) system(world, DT);

    expect(focused).toHaveLength(1);
  });

  it('focuses only the nearest of two overlapping markers', () => {
    const { sink, focused } = makeSink();
    const system = createMarkerSystem(sink);
    const world = makeWorld(
      { x: 0, y: 0 },
      [
        { id: 'far', x: 20, y: 0, radius: 40 },
        { id: 'near', x: 5, y: 0, radius: 40 },
      ],
    );

    system(world, DT);

    expect(focused).toHaveLength(1);
    expect(focused[0]!.markerId).toBe('near');
  });

  it('switches focus to the nearer marker without a blur/focus gap', () => {
    const { sink, focused, counts } = makeSink();
    const system = createMarkerSystem(sink);
    const world = makeWorld(
      { x: 0, y: 0 },
      [
        { id: 'a', x: 5, y: 0, radius: 40 },
        { id: 'b', x: 50, y: 0, radius: 40 },
      ],
    );

    system(world, DT); // a focused
    const pos = world.getComponent(world.query('playerControlled')[0], 'position')!;
    pos.x = 48; // walk toward b
    system(world, DT); // b focused

    expect(focused.map((m) => m.markerId)).toEqual(['a', 'b']);
    expect(counts.blur).toBe(0); // continuous focus chain
  });

  it('blurs when the world has no player-controlled entity', () => {
    const { sink, focused, counts } = makeSink();
    const system = createMarkerSystem(sink);
    const world = makeWorld({ x: 0, y: 0 }, [{ id: 'puzzle_1', x: 0, y: 0, radius: 26 }]);
    world.destroyEntity(world.query('playerControlled')[0]);

    system(world, DT);

    expect(focused).toHaveLength(0);
    expect(counts.blur).toBe(0); // nothing was focused before — no blur event
  });
});
