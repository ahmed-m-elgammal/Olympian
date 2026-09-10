/**
 * GameCanvas — root Skia canvas component (spec 07 §3.1).
 *
 * Wraps `@shopify/react-native-skia`'s `<Canvas>` so the rest of the
 * game layer can treat rendering as a pure React tree. The component:
 *
 *  - Fills its parent (absoluteFill) — callers position it with a
 *    sized `<View>` wrapper.
 *  - Forwards `children` straight through; children are Skia drawing
 *    nodes (`<Image>`, `<Rect>`, `<Group>`, etc.).
 *  - Optionally reports its pixel dimensions via `onLayout` so the
 *    `Camera` and culling systems know the viewport.
 *
 * Skia's `<Canvas>` does NOT participate in flexbox — children are
 * laid out in canvas pixel space. We use the `onLayout` callback (from
 * the wrapped RN `View`) to capture width/height and forward them.
 *
 * @packageDocumentation
 */

import { Canvas, useCanvasRef } from '@shopify/react-native-skia';
import React, { useEffect, useRef } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';

import { logger } from '@/shared/log';

/** Viewport dimensions reported by the canvas after layout. */
export interface CanvasViewport {
  /** Width in device pixels. */
  width: number;
  /** Height in device pixels. */
  height: number;
}

/** Props for {@link GameCanvas}. */
export interface GameCanvasProps {
  /**
   * Skia drawing nodes (e.g. `<Image>`, `<Rect>`, `<Group>`).
   * These are rendered inside the underlying `<Canvas>`.
   */
  children?: React.ReactNode;
  /**
   * Called once on initial layout and again whenever the parent
   * changes size. Useful for sizing the {@link Camera} viewport.
   */
  onLayout?: (viewport: CanvasViewport) => void;
  /**
   * Whether to enable Skia's debug overlay (FPS, draw count). Only
   * honored in __DEV__ — see spec 07 §9.
   */
  debug?: boolean;
  /**
   * Optional style override. The canvas always fills its parent; this
   * only controls the parent wrapper's appearance (background color,
   * etc.).
   */
  style?: React.CSSProperties;
}

/**
 * Root Skia canvas component. Always fills its parent — callers must
 * size the parent (typically with `flex: 1` or explicit dimensions).
 *
 * @example
 * ```tsx
 * <View style={{ flex: 1 }}>
 *   <GameCanvas onLayout={(v) => camera.setViewport(v.width, v.height)}>
 *     <CameraTransform camera={camera}>
 *       <TileMapLayer map={map} tileset={tileset} />
 *       <SpriteLayer sprites={sprites} />
 *     </CameraTransform>
 *   </GameCanvas>
 * </View>
 * ```
 */
export function GameCanvas({
  children,
  onLayout,
  debug = false,
  style,
}: GameCanvasProps): React.ReactElement {
  const ref = useCanvasRef();
  const reportedRef = useRef<CanvasViewport | null>(null);

  const handleLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    // Skip spurious zero-size layouts (e.g. during initial mount).
    if (width === 0 || height === 0) return;
    const next: CanvasViewport = { width, height };
    const prev = reportedRef.current;
    if (prev && prev.width === width && prev.height === height) return;
    reportedRef.current = next;
    if (onLayout) {
      try {
        onLayout(next);
      } catch (err) {
        logger.warn('GameCanvas onLayout callback threw', err);
      }
    }
  };

  // No teardown required; Skia owns its own surface lifecycle.
  useEffect(() => {
    return () => {
      reportedRef.current = null;
    };
  }, []);

  return (
    <View
      style={[styles.fill, style as unknown as Record<string, unknown>]}
      onLayout={handleLayout}
      collapsable={false}
    >
      <Canvas ref={ref} style={StyleSheet.absoluteFill} debug={debug}>
        {children}
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    width: '100%' as unknown as number,
    height: '100%' as unknown as number,
  },
});

export default GameCanvas;
