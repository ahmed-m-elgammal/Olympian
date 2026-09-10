/**
 * `inputStore` — live player input published to the simulation
 * (spec 07 §4.1).
 *
 * The Joystick writes the analog move vector here (via `runOnJS` from
 * the Reanimated UI thread); the `InputSystem` copies it into
 * `MoveIntent` components once per tick. This store is the **only**
 * channel from touch UI into the ECS — game systems never read
 * gestures directly.
 *
 * Ephemeral by design: never persisted, reset on scene change
 * (spec 07 §5 `loadScene` step 5 "Reset input").
 *
 * @packageDocumentation
 */

import { create } from 'zustand';

import { clampAxis } from '@/game/engine/systems/InputSystem';

export interface InputState {
  /** Analog move vector, axes in [-1, 1]; (0,0) = idle. */
  move: { x: number; y: number };
  /** Whether the joystick is currently held (drives HUD affordances). */
  isPointerDown: boolean;
  /** Publish a new move vector (clamped). */
  setMove: (x: number, y: number) => void;
  /** Joystick pressed/released. */
  setPointerDown: (down: boolean) => void;
  /** Zero the vector (gesture end / scene change). */
  clearMove: () => void;
}

export const useInputStore = create<InputState>((set) => ({
  move: { x: 0, y: 0 },
  isPointerDown: false,
  setMove: (x, y) =>
    set({ move: { x: clampAxis(x), y: clampAxis(y) } }),
  setPointerDown: (down) => set({ isPointerDown: down }),
  clearMove: () => set({ move: { x: 0, y: 0 } }),
}));

/**
 * Plain-object adapter implementing the engine's `InputSource`
 * interface — handed to `createInputSystem` when assembling a world.
 */
export const inputStoreSource = {
  getMove(): { x: number; y: number } {
    return useInputStore.getState().move;
  },
};

export default useInputStore;
