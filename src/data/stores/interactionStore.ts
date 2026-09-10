/**
 * `interactionStore` — the focused world marker published by the
 * `MarkerSystem` (spec 01 §3.1 "walk into marker", P2.E2.T4).
 *
 * The engine reports focus through the injected {@link MarkerFocusSink};
 * the scene layer binds that sink to this store (the same seam pattern
 * as `inputStore`). Screens subscribe to show the enter prompt and
 * resolve the tap via `markerTargetRoute`.
 *
 * Ephemeral by design: cleared on scene change (spec 07 §5 `loadScene`
 * step 5 resets input; interaction focus is input-adjacent state).
 *
 * @packageDocumentation
 */

import { create } from 'zustand';

import type { FocusedMarker } from '@/game/engine';

export interface InteractionState {
  /** The marker currently in the player's interact radius, if any. */
  focused: FocusedMarker | null;
  /** Focus a marker (MarkerSystem sink adapter). */
  setFocused: (marker: FocusedMarker) => void;
  /** Clear focus (walked away / scene change). */
  clearFocused: () => void;
}

export const useInteractionStore = create<InteractionState>((set) => ({
  focused: null,
  setFocused: (marker) => set({ focused: marker }),
  clearFocused: () => set({ focused: null }),
}));

/**
 * The production {@link MarkerFocusSink} — engine → store adapter.
 * Passed into the field scene builder by the game screens.
 */
export const interactionFocusSink = {
  focus: (marker: FocusedMarker) => {
    useInteractionStore.getState().setFocused(marker);
  },
  blur: () => {
    useInteractionStore.getState().clearFocused();
  },
};

export default useInteractionStore;
