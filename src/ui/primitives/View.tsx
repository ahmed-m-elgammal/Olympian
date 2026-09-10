/**
 * Token-aware `<View>` primitive.
 *
 * Spec reference: 05 §3.1 (View), task P1.E3.T3.
 *
 * Thin wrapper over `react-native`'s `<View>` that resolves the following
 * shorthand props to design tokens:
 *
 *   - `bg`       → background color (`colors[bg]`)
 *   - `radius`   → border radius (`resolveRadius(radius)`)
 *   - `elevated` → elevation preset (`shadows[elevated]`)
 *   - `bordered` → applies a 1px solid `colors.border`
 *   - `padding` / `px` / `py` / `pt` / `pb` / `ps` / `pe` → spacing tokens
 *   - `margin` / `mx` / `my` / `mt` / `mb` / `ms` / `me` → spacing tokens
 *   - `gap`     → spacing token (sets `gap` on the flex container)
 *
 * Padding/margin horizontal sides use logical (`paddingStart`/`paddingEnd`,
 * `marginStart`/`marginEnd`) so the layout flips in RTL automatically
 * (spec 10 §4.2). Vertical sides use plain `paddingTop`/`paddingBottom`.
 *
 * All other `ViewProps` from React Native are forwarded as-is.
 */

import React from 'react';
import {
  View as RNView,
  type ViewProps as RNViewProps,
  type ViewStyle,
} from 'react-native';

import {
  colors,
  resolveRadius,
  shadows,
  sizing,
  spacing,
  type ColorKey,
  type ElevationKey,
  type RadiusKey,
  type SpacingKey,
} from '@/ui/theme';

/** Props accepted by {@link View}. */
export interface ViewProps
  extends Omit<
    RNViewProps,
    // We don't actually omit anything from RN's ViewProps (style is passed
    // through); the Omit is here as a placeholder so we can add omits later
    // if a token prop name ever clashes with an RN prop name.
    never
  > {
  /** Background color token name. */
  bg?: ColorKey;
  /** Corner radius token name. */
  radius?: RadiusKey;
  /** Elevation level (0 / 1 / 2 / 4 / 8). */
  elevated?: ElevationKey;
  /** Apply a 1px solid `colors.border` outline. */
  bordered?: boolean;
  /** All-sides padding (spacing token). */
  padding?: SpacingKey;
  /** Horizontal padding (logical: start + end). */
  px?: SpacingKey;
  /** Vertical padding. */
  py?: SpacingKey;
  /** Top padding. */
  pt?: SpacingKey;
  /** Bottom padding. */
  pb?: SpacingKey;
  /** Padding-start (logical — left in LTR, right in RTL). */
  ps?: SpacingKey;
  /** Padding-end (logical — right in LTR, left in RTL). */
  pe?: SpacingKey;
  /** All-sides margin. */
  margin?: SpacingKey;
  /** Horizontal margin (logical). */
  mx?: SpacingKey;
  /** Vertical margin. */
  my?: SpacingKey;
  /** Top margin. */
  mt?: SpacingKey;
  /** Bottom margin. */
  mb?: SpacingKey;
  /** Margin-start (logical). */
  ms?: SpacingKey;
  /** Margin-end (logical). */
  me?: SpacingKey;
  /** Flex `gap` between children (spacing token). */
  gap?: SpacingKey;
}

/**
 * Build a `ViewStyle` from the token shorthand props. Returns `null` when
 * no shorthand props are set so callers can skip merging styles.
 *
 * Implementation note: the RN type-gen produces `Readonly<{...}>` shapes for
 * `ViewStyle`, so we build the style in a mutable intermediate object and
 * cast at the end.
 */
function buildStyleFromTokens(props: ViewProps): ViewStyle | null {
  const style: Record<string, unknown> = {};

  // Background color
  if (props.bg) {
    style.backgroundColor = colors[props.bg];
  }

  // Radius
  if (props.radius) {
    style.borderRadius = resolveRadius(props.radius);
  }

  // Elevation
  if (props.elevated !== undefined) {
    const preset = shadows[props.elevated];
    style.shadowColor = preset.shadowColor;
    style.shadowOpacity = preset.shadowOpacity;
    style.shadowRadius = preset.shadowRadius;
    style.shadowOffset = preset.shadowOffset;
    style.elevation = preset.elevation;
  }

  // Border
  if (props.bordered) {
    style.borderWidth = sizing.borderWidth;
    style.borderColor = colors.border;
  }

  // Padding (all sides, then specific overrides)
  if (props.padding) {
    const v = spacing[props.padding];
    style.paddingStart = v;
    style.paddingEnd = v;
    style.paddingTop = v;
    style.paddingBottom = v;
  }
  if (props.px) {
    const v = spacing[props.px];
    style.paddingStart = v;
    style.paddingEnd = v;
  }
  if (props.py) {
    const v = spacing[props.py];
    style.paddingTop = v;
    style.paddingBottom = v;
  }
  if (props.pt) {
    style.paddingTop = spacing[props.pt];
  }
  if (props.pb) {
    style.paddingBottom = spacing[props.pb];
  }
  if (props.ps) {
    style.paddingStart = spacing[props.ps];
  }
  if (props.pe) {
    style.paddingEnd = spacing[props.pe];
  }

  // Margin
  if (props.margin) {
    const v = spacing[props.margin];
    style.marginStart = v;
    style.marginEnd = v;
    style.marginTop = v;
    style.marginBottom = v;
  }
  if (props.mx) {
    const v = spacing[props.mx];
    style.marginStart = v;
    style.marginEnd = v;
  }
  if (props.my) {
    const v = spacing[props.my];
    style.marginTop = v;
    style.marginBottom = v;
  }
  if (props.mt) {
    style.marginTop = spacing[props.mt];
  }
  if (props.mb) {
    style.marginBottom = spacing[props.mb];
  }
  if (props.ms) {
    style.marginStart = spacing[props.ms];
  }
  if (props.me) {
    style.marginEnd = spacing[props.me];
  }

  // Gap
  if (props.gap) {
    style.gap = spacing[props.gap];
  }

  return Object.keys(style).length > 0 ? (style as ViewStyle) : null;
}

/**
 * Token-aware `<View>`. Renders a plain RN `<View>` with the resolved
 * token-derived styles merged on top of any `style` prop the caller passes.
 *
 * (Phase 1 omits `ref` forwarding — React 19 supports `ref` as a regular
 * prop, but the RN type-gen for `View` is a class with non-trivial ref
 * semantics. Callers that need a ref can wrap this primitive in their own
 * `React.forwardRef`.)
 */
export function View(props: ViewProps): React.JSX.Element {
  const {
    bg,
    radius,
    elevated,
    bordered,
    padding,
    px,
    py,
    pt,
    pb,
    ps,
    pe,
    margin,
    mx,
    my,
    mt,
    mb,
    ms,
    me,
    gap,
    style,
    ...rest
  } = props;

  const tokenStyle = buildStyleFromTokens({
    bg,
    radius,
    elevated,
    bordered,
    padding,
    px,
    py,
    pt,
    pb,
    ps,
    pe,
    margin,
    mx,
    my,
    mt,
    mb,
    ms,
    me,
    gap,
  });

  // Avoid spreading an empty style array — RN handles it fine but it keeps
  // test snapshots clean.
  const finalStyle = tokenStyle
    ? style
      ? [tokenStyle, style]
      : tokenStyle
    : style;

  return <RNView style={finalStyle} {...rest} />;
}
