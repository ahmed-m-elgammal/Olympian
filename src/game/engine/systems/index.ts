/**
 * System plumbing (spec 07 §1.5).
 *
 * A system is a pure-ish function over the world run once per fixed
 * tick, in registration order. The canonical order lives in
 * {@link SYSTEM_ORDER}; scenes assemble their system list from it so
 * every world steps in the same documented sequence.
 *
 * @packageDocumentation
 */

import type { World } from '../ecs/World';

/** A single ECS system: mutates the world by one fixed `dt` step. */
export type System = (world: World, dt: number) => void;

/**
 * Canonical system order per spec 07 §1.5. Systems not yet implemented
 * (AI, Puzzle, Combat, Health, Lifetime, Render-as-system) are listed
 * as comments so the eventual insertions are obvious:
 *
 *   Input → Movement → [AI] → Animation → [Puzzle] → [Combat] →
 *   [Health] → [Lifetime] → Camera → [Render]
 */
export const SYSTEM_ORDER = [
  'input',
  'movement',
  // 'ai',
  'animation',
  // 'puzzle',
  // 'combat',
  // 'health',
  // 'lifetime',
  'camera',
  // 'render',
] as const;

export type SystemName = (typeof SYSTEM_ORDER)[number];
