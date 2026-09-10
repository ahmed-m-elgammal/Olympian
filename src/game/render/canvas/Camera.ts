/**
 * Camera — world-space camera with follow, zoom, and viewport
 * transforms (spec 07 §3.5).
 *
 * The camera tracks a 2D position (top-left of the viewport in world
 * coordinates), a zoom factor, and the viewport dimensions (in device
 * pixels). Game systems call {@link Camera.follow} each tick to keep
 * the camera centered on a target entity, and the renderer queries
 * {@link Camera.getTransform} (or `worldToScreen`) to convert world
 * coordinates to screen-space draw commands.
 *
 * @packageDocumentation
 */

import { clamp } from '@/shared/math';

/** 2D point. */
export interface Point {
  x: number;
  y: number;
}

/** Viewport size in device pixels. */
export interface Viewport {
  width: number;
  height: number;
}

/**
 * Skia-friendly camera transform. Pass to a `<Group transform={...}>`
 * or to `canvas.translate` / `canvas.scale`.
 *
 * Order of application (Skia post-multiplies matrices): first scale,
 * then translate. So a world point `(wx, wy)` maps to screen:
 *
 *   screen.x = wx * scale + translateX
 *   screen.y = wy * scale + translateY
 *
 * For our camera that means:
 *   translateX = -camera.x * zoom
 *   translateY = -camera.y * zoom
 *   scale = zoom
 */
export interface CameraTransform {
  translateX: number;
  translateY: number;
  scale: number;
}

/** Default zoom limits — used by {@link Camera.setZoom} when not given. */
export const DEFAULT_ZOOM_MIN = 0.5;
export const DEFAULT_ZOOM_MAX = 4;

/**
 * 2D camera with smooth follow and zoom.
 *
 * @example
 * ```ts
 * const camera = new Camera();
 * camera.setViewport(800, 600);
 * camera.position.x = 100;
 * camera.position.y = 100;
 *
 * // Each tick:
 * camera.follow(player.position, 0.1);
 *
 * // Renderer:
 * const t = camera.getTransform();
 * canvas.translate(t.translateX, t.translateY);
 * canvas.scale(t.scale, t.scale);
 * ```
 */
export class Camera {
  /** Top-left of the viewport in world coordinates. */
  public position: Point = { x: 0, y: 0 };
  /** Zoom factor (1 = 1:1). Clamped to [zoomMin, zoomMax]. */
  public zoom: number = 1;
  /** Viewport size in device pixels. */
  public viewport: Viewport = { width: 0, height: 0 };

  private zoomMin: number = DEFAULT_ZOOM_MIN;
  private zoomMax: number = DEFAULT_ZOOM_MAX;

  /**
   * Set the viewport size. Typically called from `GameCanvas`'s
   * `onLayout` callback.
   */
  setViewport(width: number, height: number): void {
    this.viewport.width = width;
    this.viewport.height = height;
  }

  /**
   * Set the zoom factor, clamped to `[min, max]`. Defaults:
   * `[0.5, 4]`.
   */
  setZoom(z: number, min: number = DEFAULT_ZOOM_MIN, max: number = DEFAULT_ZOOM_MAX): void {
    this.zoomMin = min;
    this.zoomMax = max;
    this.zoom = clamp(z, min, max);
  }

  /**
   * Snap the camera's top-left to a specific world position (no
   * smoothing).
   */
  setPosition(x: number, y: number): void {
    this.position.x = x;
    this.position.y = y;
  }

  /**
   * Smoothly move the camera so that the given world-space target is
   * centered in the viewport.
   *
   * @param target World position to center on.
   * @param lerp    Interpolation factor in `[0, 1]`. 0 = no movement,
   *                1 = snap. Typical values: `0.05..0.2`.
   */
  follow(target: Point, lerp: number): void {
    const t = clamp(lerp, 0, 1);
    const targetX = target.x - this.viewport.width / 2;
    const targetY = target.y - this.viewport.height / 2;
    this.position.x = this.position.x + (targetX - this.position.x) * t;
    this.position.y = this.position.y + (targetY - this.position.y) * t;
  }

  /**
   * Convert a world-space point to screen-space device pixels.
   */
  worldToScreen(point: Point): Point {
    return {
      x: (point.x - this.position.x) * this.zoom,
      y: (point.y - this.position.y) * this.zoom,
    };
  }

  /**
   * Convert a screen-space point (e.g. a touch) back to world coords.
   * Inverse of {@link worldToScreen}.
   */
  screenToWorld(point: Point): Point {
    return {
      x: point.x / this.zoom + this.position.x,
      y: point.y / this.zoom + this.position.y,
    };
  }

  /**
   * Return a Skia-friendly transform: `{ translateX, translateY,
   * scale }`. Apply by translating then scaling (Skia post-multiplies
   * matrices, so the translate happens after scale in world space —
   * which is what we want for "camera moves over a static world").
   */
  getTransform(): CameraTransform {
    return {
      translateX: -this.position.x * this.zoom,
      translateY: -this.position.y * this.zoom,
      scale: this.zoom,
    };
  }

  /**
   * Return the world-space rectangle currently visible in the
   * viewport. Useful for culling.
   */
  getVisibleBounds(): { x: number; y: number; width: number; height: number } {
    const w = this.viewport.width / this.zoom;
    const h = this.viewport.height / this.zoom;
    return { x: this.position.x, y: this.position.y, width: w, height: h };
  }
}

export default Camera;
