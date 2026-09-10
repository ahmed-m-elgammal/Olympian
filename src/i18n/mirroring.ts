/**
 * Logical-to-physical layout conversion helpers for RTL.
 *
 * Spec reference: 10 §4.2 (Component-level RTL), 10 §4.3 (Sprite mirroring).
 *
 * React Native exposes logical style props (`marginStart`, `paddingEnd`,
 * `textAlign: 'start'/'end'`) that auto-flip based on `I18nManager.isRTL`.
 * However, when you need a raw numeric value (e.g., Skia draw coordinates,
 * `Animated.timing` to a fixed pixel offset, absolute-positioned views),
 * you have to flip the sign or swap leading/trailing values manually.
 *
 * These helpers centralize that math so callers don't repeat themselves.
 *
 * NOTE: Sprite mirroring (per-sprite flipX in the render layer) is handled
 * separately in the rendering system (spec 10 §4.3). These helpers cover
 * only the layout/spacing/transform cases.
 */

/**
 * Flip the sign of a numeric value when in RTL. Used for one-dimensional
 * values like `translateX` offsets or x-coordinates where positive
 * normally means "right" but in RTL should mean "left".
 *
 * @example
 *   mirrorValue(20, false)  // → 20
 *   mirrorValue(20, true)   // → -20
 *   mirrorValue(0, true)    // → 0  (zero is unchanged)
 */
export function mirrorValue(value: number, rtl: boolean): number {
  return rtl ? -value : value;
}

/**
 * Swap two spacing values when in RTL. Used for asymmetric leading/
 * trailing spacing that needs to flip in RTL but where logical props
 * (`marginStart`/`marginEnd`) aren't available.
 *
 * @example
 *   mirrorSpacing(8, 16, false)  // → { left: 8,  right: 16 }
 *   mirrorSpacing(8, 16, true)   // → { left: 16, right: 8  }
 */
export function mirrorSpacing(
  left: number,
  right: number,
  rtl: boolean,
): { left: number; right: number } {
  return rtl ? { left: right, right: left } : { left, right };
}

/**
 * Convert logical (start, end) insets to physical (left, right) insets
 * based on the current text direction. Used in cases where logical
 * `paddingStart`/`paddingEnd` aren't available — e.g., constructing
 * absolute-positioned children, Skia insets, or non-RN component trees.
 *
 * In LTR: start → left, end → right.
 * In RTL: start → right, end → left.
 *
 * @example
 *   mirrorInset({ start: 8, end: 16 }, false)  // → { left: 8,  right: 16 }
 *   mirrorInset({ start: 8, end: 16 }, true)   // → { left: 16, right: 8  }
 */
export function mirrorInset(
  insets: { start: number; end: number },
  rtl: boolean,
): { left: number; right: number } {
  return rtl
    ? { left: insets.end, right: insets.start }
    : { left: insets.start, right: insets.end };
}

/**
 * A 4-sided inset record in logical (start/end) form.
 * Useful when passing insets around between layers (e.g., safe-area →
 * layout paddings) without committing to LTR/RTL physical sides.
 */
export interface LogicalInsets {
  /** Top inset (unchanged by RTL). */
  top: number;
  /** Bottom inset (unchanged by RTL). */
  bottom: number;
  /** Leading inset (left in LTR, right in RTL). */
  start: number;
  /** Trailing inset (right in LTR, left in RTL). */
  end: number;
}

/**
 * A 4-sided inset record in physical (left/right) form.
 */
export interface PhysicalInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * Convert a full 4-sided logical inset record to its physical (left/right)
 * form. Top and bottom are unchanged. Convenience wrapper around
 * {@link mirrorInset} for the common case where you have a complete
 * insets object (e.g., from safe-area-context).
 *
 * @example
 *   mirrorInsets({ top: 0, bottom: 34, start: 8, end: 16 }, true)
 *   // → { top: 0, bottom: 34, left: 16, right: 8 }
 */
export function mirrorInsets(insets: LogicalInsets, rtl: boolean): PhysicalInsets {
  const { left, right } = mirrorInset(
    { start: insets.start, end: insets.end },
    rtl,
  );
  return { top: insets.top, bottom: insets.bottom, left, right };
}
