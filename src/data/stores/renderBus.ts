/**
 * `renderBus` — per-frame bridge from the simulation to the Skia layer
 * (spec 07 §2: `useRenderBus.getState().setDrawList(drawList)`).
 *
 * The `GameWorld` publishes the sorted draw list + camera transform
 * once per rendered frame; `DrawListRenderer` subscribes and paints.
 * The bus deliberately holds NO simulation state — it is a mailbox, so
 * a dropped or stalled frame never corrupts the game state.
 *
 * Note on churn: this store updates at frame rate (~60Hz). React
 * subscribers re-render per frame by design; the renderer paints a
 * single `<Picture>`, keeping reconciliation trivial. If profiling
 * ever demands it, the same mailbox can feed a Reanimated recorder
 * without touching publishers.
 *
 * @packageDocumentation
 */

import { create } from 'zustand';

import type { CameraTransform } from '@/game/render/canvas/Camera';
import type { DrawCommand } from '@/game/engine/render/DrawCommand';

export interface RenderBusState {
  /** Current frame's sorted draw commands (world space). */
  drawList: readonly DrawCommand[];
  /** Camera transform to apply on the Skia root group. */
  camera: CameraTransform | null;
  /** Monotonic frame counter (lets consumers ignore stale work). */
  frameId: number;
  /** Publish one frame. */
  publish: (drawList: readonly DrawCommand[], camera: CameraTransform) => void;
  /** Drop the frame contents (scene teardown). */
  reset: () => void;
}

export const useRenderBus = create<RenderBusState>((set) => ({
  drawList: [],
  camera: null,
  frameId: 0,
  // The draw list is copied on publish: the producer (RenderSystem)
  // reuses ONE array every frame, so storing the reference would make
  // the mailbox observe later mutation — a dropped frame could then
  // render next frame's data. Ownership transfers at the mailbox.
  publish: (drawList, camera) =>
    set((prev) => ({ drawList: [...drawList], camera, frameId: prev.frameId + 1 })),
  reset: () => set({ drawList: [], camera: null, frameId: 0 }),
}));

export default useRenderBus;
