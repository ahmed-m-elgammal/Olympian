/**
 * Marker routing — pure map from a focused marker to a navigation
 * decision (spec 01 §3.1 core loop, spec 06 §1 MainStack routes).
 *
 * The screens consume this so "what does entering this marker do" is
 * testable data, not buried in a press handler. Routes that have no
 * screen yet (Boss — P2.E4) still resolve; the screen layer decides to
 * toast instead of navigate.
 *
 * @packageDocumentation
 */

import type { MarkerKind } from '@/game/engine/ecs/components';

/** Where entering a marker should take the player. */
export type MarkerRoute =
  | { screen: 'Level'; levelId: string }
  | { screen: 'Boss'; bossId: string }
  | { screen: 'Hub' }
  | { screen: 'Overworld' };

/** Resolve a marker's kind + target to a route decision. */
export function markerTargetRoute(kind: MarkerKind, target: string): MarkerRoute {
  switch (kind) {
    case 'puzzle':
      return { screen: 'Level', levelId: target };
    case 'boss':
      return { screen: 'Boss', bossId: target };
    case 'portal':
      return target === 'hub' ? { screen: 'Hub' } : { screen: 'Overworld' };
  }
}
