/**
 * Token-aware `<Text>` primitive.
 *
 * Spec reference: 05 §3.2 (Text), task P1.E3.T4, 10 §4 (RTL strategy).
 *
 * Variants:   `'display' | 'title' | 'body' | 'caption' | 'label'`
 * Scales:     `'sm' | 'md' | 'lg'`
 *
 * The variant + scale are resolved to a {@link TypographyPreset} from
 * `tokens.typography`. Callers can override individual fields via
 * `weight`, `color`, and `align` props.
 *
 * RTL handling: the component subscribes to the current locale via
 * `useTranslation()` and sets `writingDirection` on the RN `<Text>` so the
 * text lays out in the correct direction (spec 10 §4.5). Logical alignment
 * (`align: 'start' | 'end'`) is mapped to physical `left`/`right` based on
 * the current locale's direction.
 */

import React from 'react';
import {
  I18nManager,
  Text as RNText,
  type TextProps as RNTextProps,
  type TextStyle,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import {
  colors,
  fontWeight as weightTokens,
  typography,
  type ColorKey,
  type FontWeightKey,
  type TextScale,
  type TextVariant,
} from '@/ui/theme';
import { isRTL } from '@/i18n';

/** Logical text alignment. `'start'`/`'end'` are RTL-aware. */
export type TextAlign = 'start' | 'center' | 'end' | 'left' | 'right' | 'auto';

/** Props accepted by {@link Text}. */
export interface TextProps extends Omit<RNTextProps, 'style'> {
  /** Typography variant (defaults to `'body'`). */
  variant?: TextVariant;
  /** Size scale within the variant (defaults to `'md'`). */
  scale?: TextScale;
  /** Color token name (defaults to `'text'`). */
  color?: ColorKey;
  /** Logical text alignment. `'start'`/`'end'` flip in RTL. */
  align?: TextAlign;
  /** Override font weight. */
  weight?: FontWeightKey;
  /** User-supplied style. Merged on top of the resolved token style. */
  style?: TextStyle | TextStyle[];
  /** Optional children — typically a string or fragment of strings. */
  children?: React.ReactNode;
}

/**
 * Map a logical {@link TextAlign} to a React Native `textAlign` value,
 * given the current RTL state.
 *
 * - `'start'` → `'right'` in RTL, `'left'` in LTR
 * - `'end'`   → `'left'`  in RTL, `'right'` in LTR
 * - `'left'` / `'right'` / `'center'` / `'auto'` pass through unchanged
 */
function resolveAlign(align: TextAlign, rtl: boolean): TextStyle['textAlign'] {
  switch (align) {
    case 'start':
      return rtl ? 'right' : 'left';
    case 'end':
      return rtl ? 'left' : 'right';
    case 'center':
      return 'center';
    case 'left':
      return 'left';
    case 'right':
      return 'right';
    case 'auto':
      return 'auto';
    default:
      return undefined;
  }
}

/**
 * Token-aware `<Text>`. Resolves `variant`/`scale`/`color`/`align`/`weight`
 * from theme tokens and sets `writingDirection` from the active locale.
 *
 * (Phase 1 omits `ref` forwarding — React 19 supports `ref` as a regular
 * prop, but the RN type-gen for `Text` is a class with non-trivial ref
 * semantics. Callers that need a ref can wrap this primitive.)
 */
export function Text(props: TextProps): React.JSX.Element {
  const {
    variant = 'body',
    scale = 'md',
    color = 'text',
    align,
    weight,
    style,
    children,
    ...rest
  } = props;

  // Derive the RTL state. The layout direction is owned by I18nManager
  // (forceRTL applies after a restart — spec 10 §4.1); the locale-derived
  // check covers the window right after the user picks an RTL locale but
  // before that restart. Either signal flips the writing direction.
  const { i18n } = useTranslation();
  const rtl = I18nManager.isRTL || isRTL(i18n.language);

  const preset = typography[variant][scale];

  const resolvedStyle = {
    fontFamily: preset.fontFamily,
    fontSize: preset.fontSize,
    fontWeight: weight ? weightTokens[weight] : preset.fontWeight,
    lineHeight: preset.lineHeight,
    color: colors[color],
    writingDirection: rtl ? 'rtl' : 'ltr',
    ...(preset.letterSpacing !== undefined
      ? { letterSpacing: preset.letterSpacing }
      : {}),
    ...(align ? { textAlign: resolveAlign(align, rtl) } : {}),
  } as TextStyle;

  // User-supplied style overrides the resolved preset style (last wins
  // in the array merge).
  const finalStyle = style ? [resolvedStyle, style] : resolvedStyle;

  return (
    <RNText style={finalStyle} {...rest}>
      {children}
    </RNText>
  );
}
