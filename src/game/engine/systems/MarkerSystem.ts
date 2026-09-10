/**
 * MarkerSystem — proximity focus for world markers
 * (spec 01 §3.1, P2.E2.T4).
 *
 * Each tick it measures the player-controlled entity's feet against
 * every `marker` entity's radius. The nearest marker in range becomes
 * the **focused** marker and is reported through the injected
 * {@link MarkerFocusSink}; walking away reports `blur()`. The system is
 * engine-pure — the sink is the seam to the UI layer (the production
 * adapter writes the `interactionStore`, tests capture calls), mirroring
 * how `InputSystem` consumes an injected `InputSource`.
 *
 * The marker's sprite/animation are untouched here; focus is purely
 * gameplay state.
 *
 * @packageDocumentation
 */

import type { Marker, Position } from '../ecs/components';
import type { World, EntityId } from '../ecs/World';
import type { System } from './index';

/** The focused marker, flattened to plain data for the UI layer. */
export interface FocusedMarker {
  readonly markerId: string;
  readonly kind: Marker['kind'];
  readonly target: string;
  readonly labelKey: string;
}

/** Consumes focus changes (UI store adapter / test spy). */
export interface MarkerFocusSink {
  /** A marker became focused (player walked into its radius). */
  focus(marker: FocusedMarker): void;
  /** The previously focused marker is no longer in range. */
  blur(): void;
}

/** Squared distance helper (avoids a sqrt per marker per tick). */
function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/** Build the {@link MarkerSystem}. */
export function createMarkerSystem(sink: MarkerFocusSink): System {
  /** Currently focused marker id, or null when nothing is in range. */
  let focusedId: string | null = null;

  return (world: World) => {
    // One local player per scene in P2 (spec 07 §1.3).
    const playerId = world.query('playerControlled', 'position')[0];
    const markers = world.query('marker', 'position');

    let bestId: EntityId | null = null;
    let bestDist = Infinity;

    if (playerId !== undefined) {
      const pos = world.getComponent(playerId, 'position') as Position;
      for (const id of markers) {
        const marker = world.getComponent(id, 'marker') as Marker;
        const markerPos = world.getComponent(id, 'position') as Position;
        const inRange =
          distSq(pos.x, pos.y, markerPos.x, markerPos.y) <=
          marker.radiusPx * marker.radiusPx;
        marker.playerInFocus = inRange;
        if (inRange) {
          const d = distSq(pos.x, pos.y, markerPos.x, markerPos.y);
          if (d < bestDist) {
            bestDist = d;
            bestId = id;
          }
        }
      }
    } else {
      // No player (e.g. hub-less headless test): nothing can focus.
      for (const id of markers) {
        (world.getComponent(id, 'marker') as Marker).playerInFocus = false;
      }
    }

    const nextId = bestId !== null ? (world.getComponent(bestId, 'marker') as Marker).markerId : null;
    if (nextId === focusedId) return;

    focusedId = nextId;
    if (bestId !== null) {
      const marker = world.getComponent(bestId, 'marker') as Marker;
      sink.focus({
        markerId: marker.markerId,
        kind: marker.kind,
        target: marker.target,
        labelKey: marker.labelKey,
      });
    } else {
      sink.blur();
    }
  };
}

export default createMarkerSystem;
