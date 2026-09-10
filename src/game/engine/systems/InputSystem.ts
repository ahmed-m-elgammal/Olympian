/**
 * InputSystem — read the input source → write `MoveIntent` components
 * (spec 07 §1.5, P2.E1.T5).
 *
 * The system is the **only** bridge between the UI-thread input store
 * and the ECS simulation: UI code (Joystick) publishes an analog vector
 * to `inputStore`, and this system copies it into `MoveIntent`
 * components on every `playerControlled` entity each tick. Systems
 * downstream (Movement) therefore never import React or Zustand —
 * the spec's dataflow boundary (07 §4.1).
 *
 * @packageDocumentation
 */

import type { MoveIntent } from '../ecs/components';
import type { World } from '../ecs/World';
import type { System } from './index';

/**
 * Anything that can supply an analog move vector. The production
 * source adapts `inputStore`; tests pass a stub.
 */
export interface InputSource {
  /** Current move vector, each axis clamped to [-1, 1]. */
  getMove(): { x: number; y: number };
}

/** Clamp helper shared by the store adapter. */
export function clampAxis(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.min(1, Math.max(-1, v));
}

/** Build the {@link InputSystem}. */
export function createInputSystem(source: InputSource): System {
  return (world: World) => {
    const raw = source.getMove();
    const x = clampAxis(raw.x);
    const y = clampAxis(raw.y);

    for (const id of world.query('playerControlled', 'moveIntent')) {
      const intent = world.getComponent(id, 'moveIntent') as MoveIntent;
      intent.x = x;
      intent.y = y;
    }
  };
}

export default createInputSystem;
