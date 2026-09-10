/**
 * `<Input>` primitive — token-aware `TextInput` wrapper.
 *
 * Spec reference: 05 §3.5 (Input), task P1.E3.T7, 10 §4.5 (RTL typography).
 *
 * Accepts the standard text input props (`value`, `onChangeText`,
 * `placeholder`, `label?`, `error?`, `disabled?`, `secureTextEntry?`)
 * plus token-driven styling. The label and error are rendered via the
 * `<Text>` primitive so they automatically pick up the right color and
 * font for the active theme and locale.
 */

import React from 'react';
import {
  I18nManager,
  StyleSheet,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type ReturnKeyTypeOptions,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { isRTL } from '@/i18n';
import {
  colors,
  fontFamily,
  fontSize,
  sizing,
  spacing,
} from '@/ui/theme';
import { Text } from '@/ui/primitives/Text';

/** Props accepted by {@link Input}. */
export interface InputProps {
  /** Current value (controlled input). */
  value: string;
  /** Called on every keystroke with the new text. */
  onChangeText: (text: string) => void;
  /** Placeholder text (plain string, not i18n key — caller is responsible). */
  placeholder?: string;
  /** Optional label rendered above the input. */
  label?: string;
  /** Optional error message rendered below the input (tints border red). */
  error?: string;
  /** Disabled state — input is non-editable and visually dimmed. */
  disabled?: boolean;
  /** Mask the text (for passwords). */
  secureTextEntry?: boolean;
  /** Max character count. */
  maxLength?: number;
  /** Keyboard type. Default `'default'`. */
  keyboardType?: KeyboardTypeOptions;
  /** Auto-capitalization mode. Default `'none'`. */
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  /** Return key type. Default `'default'`. */
  returnKeyType?: ReturnKeyTypeOptions;
  /** Submit handler. */
  onSubmitEditing?: () => void;
  /** Focus handler. */
  onFocus?: () => void;
  /** Blur handler. */
  onBlur?: () => void;
  /** Test ID for the underlying TextInput. */
  testID?: string;
}

/** Resolved border + text state — all styles are static, selected by state. */
type InputStateStyleKey = 'enabled' | 'disabled';

/**
 * Render a token-styled text input with optional label and error.
 *
 * The label, when present, sits above the input with a small vertical
 * margin. The error message, when present, sits below in `colors.danger`.
 */
export function Input(props: InputProps): React.JSX.Element {
  const {
    value,
    onChangeText,
    placeholder,
    label,
    error,
    disabled = false,
    secureTextEntry,
    maxLength,
    keyboardType = 'default',
    autoCapitalize = 'none',
    returnKeyType,
    onSubmitEditing,
    onFocus,
    onBlur,
    testID,
  } = props;

  // Subscribe to locale changes so the input's writing direction flips.
  const { i18n } = useTranslation();

  // The layout direction is owned by I18nManager (forceRTL applies after a
  // restart); the locale-derived check covers the window right after the
  // user picks an RTL locale but before that restart. Either signal flips
  // the input into RTL text mode (spec 10 §4.1–4.2).
  const rtl = I18nManager.isRTL || isRTL(i18n.language);

  const stateStyle: InputStateStyleKey = disabled ? 'disabled' : 'enabled';
  const borderStyle = error
    ? borderStyles.error
    : disabled
      ? borderStyles.disabledBorder
      : borderStyles.default;
  const dirStyle = rtl ? directionStyles.rtl : directionStyles.ltr;

  return (
    <View style={styles.container}>
      {label ? (
        <Text variant="label" scale="sm" color="textMuted" style={styles.label}>
          {label}
        </Text>
      ) : null}

      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textDisabled}
        editable={!disabled}
        secureTextEntry={secureTextEntry}
        maxLength={maxLength}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        onFocus={onFocus}
        onBlur={onBlur}
        style={[styles.input, stateStyles[stateStyle], borderStyle, dirStyle]}
      />

      {error ? (
        <Text variant="caption" scale="sm" color="danger" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  label: {
    marginStart: spacing.xs,
    marginBottom: spacing.xs,
  },
  input: {
    fontSize: fontSize.md,
    fontFamily: fontFamily.system,
    padding: 0, // zero out the iOS default padding; we use paddingHorizontal
    paddingHorizontal: spacing.md,
    height: sizing.buttonHeightMd,
    borderWidth: sizing.borderWidth,
    borderRadius: sizing.radiusMd,
  },
  error: {
    marginStart: spacing.xs,
    marginTop: spacing.xs,
  },
});

const stateStyles = StyleSheet.create({
  enabled: {
    color: colors.text,
    opacity: 1,
  },
  disabled: {
    color: colors.textDisabled,
    opacity: 0.6,
  },
});

const borderStyles = StyleSheet.create({
  default: {
    borderColor: colors.borderStrong,
  },
  error: {
    borderColor: colors.danger,
  },
  disabledBorder: {
    borderColor: colors.border,
  },
});

const directionStyles = StyleSheet.create({
  ltr: {
    writingDirection: 'ltr',
    textAlign: 'left',
  },
  rtl: {
    writingDirection: 'rtl',
    textAlign: 'right',
  },
});
