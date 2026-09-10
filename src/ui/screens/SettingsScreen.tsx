/**
 * `SettingsScreen` — audio, language, accessibility settings.
 *
 * Spec reference: 06 §2.12 (SettingsModal), task P1.E3.T15, 11 §6 (audio wiring).
 *
 * Three sections:
 *   1. Audio — music volume + SFX volume. Each is a 5-step segmented slider
 *      (0/25/50/75/100%) bound to `audio.mixer.setGroupVolume('music' | 'sfx', v)`
 *      and persisted to MMKV via `setMusicVolume` / `setSfxVolume`.
 *   2. Language — link to `LanguagePickerScreen`.
 *   3. Accessibility — text scale (1.0 / 1.25 / 1.5 / 2.0), reduce-motion
 *      toggle, color-blind mode picker. Persisted to MMKV.
 *
 * Includes a "Back" button that pops back to the previous screen.
 *
 * The slider UI is implemented as a segmented control because RN core
 * doesn't ship a Slider component. When a gesture-based slider is needed
 * (post-Phase 1), this file is the only thing that needs to change.
 */

import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';

import { audio } from '@/platform/audio';
import {
  getMusicVolume,
  getSfxVolume,
  setMusicVolume,
  setSfxVolume,
  mmkv,
} from '@/platform/storage/mmkv';
import type { Locale } from '@/i18n';
import { colors, sizing, spacing, type ColorKey } from '@/ui/theme';
import { Button } from '@/ui/primitives/Button';
import { Icon } from '@/ui/primitives/Icon';
import { Text } from '@/ui/primitives/Text';
import { Card } from '@/ui/composed/Card';
import { toast } from '@/ui/composed/Toast';
import type { RootStackScreenProps } from '@/ui/navigation/RootNavigator';

/** MMKV key prefixes for the accessibility settings. */
const TEXT_SCALE_KEY = 'settings.accessibility.text_scale';
const REDUCE_MOTION_KEY = 'settings.accessibility.reduce_motion';
const COLOR_BLIND_MODE_KEY = 'settings.accessibility.color_blind_mode';

/** Valid text-scale multipliers (spec 05 §2.3 + 06 §2.12). */
const TEXT_SCALES = [1.0, 1.25, 1.5, 2.0] as const;
/** Volume slider steps (0%, 25%, 50%, 75%, 100%). */
const VOLUME_STEPS = [0, 0.25, 0.5, 0.75, 1.0] as const;
/** Color-blind modes (spec 05 §8). */
const COLOR_BLIND_MODES = ['off', 'protanopia', 'deuteranopia', 'tritanopia'] as const;
type ColorBlindMode = (typeof COLOR_BLIND_MODES)[number];

/** Resolve a color-blind mode to its i18n key. */
function colorBlindLabelKey(mode: ColorBlindMode): string {
  switch (mode) {
    case 'off':
      return 'ui:settings.color_blind_off';
    case 'protanopia':
      return 'ui:settings.color_blind_protanopia';
    case 'deuteranopia':
      return 'ui:settings.color_blind_deuteranopia';
    case 'tritanopia':
      return 'ui:settings.color_blind_tritanopia';
  }
}

/** Map a locale code to its native display name (language row subtitle). */
const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  ar: 'العربية',
};

/** Format a volume fraction as a percent string ("0%", "25%", …). */
function formatPercent(v: number): string {
  return `${Math.round(v * 100)}%`;
}

/** Props accepted by {@link SettingsScreen}. */
export type SettingsScreenProps = RootStackScreenProps<'Settings'>;

/**
 * Settings screen — three sections + Back button.
 */
export function SettingsScreen(_props: SettingsScreenProps): React.JSX.Element {
  const navigation = useNavigation<RootStackScreenProps<'Settings'>['navigation']>();
  const { t, i18n } = useTranslation();

  /** Native display name of the active locale (falls back to the raw code). */
  const activeLocaleName: string =
    LOCALE_NAMES[i18n.language as Locale] ?? i18n.language ?? 'en';

  // ---- Audio state (initialized from MMKV / mixer) ----
  const [musicVolume, setMusicVolumeState] = React.useState<number>(() => {
    // Try the mixer first (it loads from MMKV on audio.init), then MMKV
    // directly as a fallback.
    try {
      return audio.mixer.getGroupVolume('music');
    } catch {
      return getMusicVolume();
    }
  });
  const [sfxVolume, setSfxVolumeState] = React.useState<number>(() => {
    try {
      return audio.mixer.getGroupVolume('sfx');
    } catch {
      return getSfxVolume();
    }
  });

  // ---- Accessibility state (read from MMKV on mount) ----
  const [textScale, setTextScale] = React.useState<number>(() => {
    const v = mmkv.getNumber(TEXT_SCALE_KEY);
    return v ?? 1.0;
  });
  const [reduceMotion, setReduceMotion] = React.useState<boolean>(() => {
    const v = mmkv.getBoolean(REDUCE_MOTION_KEY);
    return v ?? false;
  });
  const [colorBlindMode, setColorBlindMode] = React.useState<ColorBlindMode>(() => {
    const v = mmkv.getString(COLOR_BLIND_MODE_KEY);
    if (v && (COLOR_BLIND_MODES as readonly string[]).includes(v)) {
      return v as ColorBlindMode;
    }
    return 'off';
  });

  // ---- Handlers ----
  const handleMusicVolume = (v: number): void => {
    setMusicVolumeState(v);
    setMusicVolume(v);
    try {
      audio.mixer.setGroupVolume('music', v);
    } catch {
      // Mixer may not be initialized in headless / test environments —
      // the persisted MMKV value is still updated above.
      // (silently swallow)
    }
  };
  const handleSfxVolume = (v: number): void => {
    setSfxVolumeState(v);
    setSfxVolume(v);
    try {
      audio.mixer.setGroupVolume('sfx', v);
    } catch {
      // (silently swallow)
    }
  };
  const handleTextScale = (v: number): void => {
    setTextScale(v);
    mmkv.set(TEXT_SCALE_KEY, v);
  };
  const handleReduceMotion = (v: boolean): void => {
    setReduceMotion(v);
    mmkv.set(REDUCE_MOTION_KEY, v);
  };
  const handleColorBlindMode = (mode: ColorBlindMode): void => {
    setColorBlindMode(mode);
    mmkv.set(COLOR_BLIND_MODE_KEY, mode);
    toast(`${t('ui:settings.color_blind_mode')}: ${t(colorBlindLabelKey(mode))}`, {
      variant: 'info',
      duration: 1500,
    });
  };

  const handleBack = (): void => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.reset({ index: 0, routes: [{ name: 'Title' }] });
    }
  };

  return (
    <ScrollView testID="settings-screen" style={styles.scroll} contentContainerStyle={styles.scrollContent}>
      <View style={styles.header}>
        <Pressable
          testID="settings-back-button"
          accessibilityRole="button"
          accessibilityLabel={t('common:back')}
          onPress={handleBack}
          style={styles.backButton}
        >
          <Icon name="back" size="md" color="textMuted" />
          <Text variant="label" scale="md" color="textMuted">
            {t('common:back')}
          </Text>
        </Pressable>
        <Text variant="title" scale="md" color="text">
          {t('ui:settings.title')}
        </Text>
      </View>

      {/* ---------------- Audio section ---------------- */}
      <Card title={t('ui:settings.audio')} variant="default" padding="lg">
        <Text variant="label" scale="md" color="textMuted" style={styles.fieldLabel}>
          {t('ui:settings.music_volume')}
        </Text>
        <SegmentedSlider
          testID="slider-music"
          value={musicVolume}
          steps={VOLUME_STEPS}
          formatValue={formatPercent}
          onChange={handleMusicVolume}
        />

        <Text
          variant="label"
          scale="md"
          color="textMuted"
          style={[styles.fieldLabel, styles.fieldLabelGap]}
        >
          {t('ui:settings.sfx_volume')}
        </Text>
        <SegmentedSlider
          testID="slider-sfx"
          value={sfxVolume}
          steps={VOLUME_STEPS}
          formatValue={formatPercent}
          onChange={handleSfxVolume}
        />
      </Card>

      {/* ---------------- Language section ---------------- */}
      <Card title={t('common:language')} variant="default" padding="lg">
        <Pressable
          testID="settings-language-row"
          accessibilityRole="button"
          accessibilityLabel={t('ui:settings.language')}
          onPress={() => navigation.navigate('LanguagePicker')}
          style={styles.row}
        >
          <Icon name="language" size="md" color="secondary" />
          <View style={styles.rowText}>
            <Text variant="body" scale="md" color="text">
              {t('ui:settings.language')}
            </Text>
            <Text variant="caption" scale="sm" color="textMuted">
              {activeLocaleName}
            </Text>
          </View>
          <Icon name="chevron_end" size="sm" color="textMuted" />
        </Pressable>
      </Card>

      {/* ---------------- Accessibility section ---------------- */}
      <Card title={t('ui:settings.accessibility')} variant="default" padding="lg">
        <Text variant="label" scale="md" color="textMuted" style={styles.fieldLabel}>
          {t('ui:settings.text_scale')}
        </Text>
        <SegmentedPicker
          testID="picker-text-scale"
          value={textScale}
          options={TEXT_SCALES}
          formatValue={(v) => `${v}x`}
          onChange={handleTextScale}
        />

        <Text
          variant="label"
          scale="md"
          color="textMuted"
          style={[styles.fieldLabel, styles.fieldLabelGap]}
        >
          {t('ui:settings.reduce_motion')}
        </Text>
        <ToggleSwitch
          testID="toggle-reduce-motion"
          value={reduceMotion}
          onChange={handleReduceMotion}
        />

        <Text
          variant="label"
          scale="md"
          color="textMuted"
          style={[styles.fieldLabel, styles.fieldLabelGap]}
        >
          {t('ui:settings.color_blind_mode')}
        </Text>
        <SegmentedPicker
          testID="picker-color-blind"
          value={colorBlindMode}
          options={COLOR_BLIND_MODES}
          formatValue={(m) => t(colorBlindLabelKey(m as ColorBlindMode))}
          onChange={(v) => handleColorBlindMode(v as ColorBlindMode)}
        />
      </Card>

      <View style={styles.footer}>
        <Button
          testID="settings-reset-button"
          label={t('ui:settings.reset_defaults')}
          variant="ghost"
          size="medium"
          onPress={() => {
            handleMusicVolume(0.8);
            handleSfxVolume(1.0);
            handleTextScale(1.0);
            handleReduceMotion(false);
            handleColorBlindMode('off');
            toast(t('common:apply'), { variant: 'success' });
          }}
        />
      </View>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// SegmentedSlider — 5-step volume slider
// ---------------------------------------------------------------------------

interface SegmentedSliderProps {
  testID?: string;
  value: number;
  steps: readonly number[];
  formatValue: (v: number) => string;
  onChange: (v: number) => void;
}

/**
 * 5-step segmented slider. Renders one button per step; the active step
 * uses `colors.primary`, inactive steps use `colors.border`.
 */
function SegmentedSlider({
  testID,
  value,
  steps,
  formatValue,
  onChange,
}: SegmentedSliderProps): React.JSX.Element {
  return (
    <View testID={testID} style={styles.sliderRow}>
      {steps.map((step) => {
        const active = Math.abs(value - step) < 0.01;
        const bgColor: ColorKey = active ? 'primary' : 'border';
        return (
          <Pressable
            key={step}
            testID={`${testID}-step-${step}`}
            accessibilityRole="adjustable"
            accessibilityLabel={`${formatPercent(step)}`}
            accessibilityState={{ selected: active }}
            onPress={() => onChange(step)}
            style={[
              styles.sliderSegment,
              {
                backgroundColor: colors[bgColor],
                borderColor: active ? colors.primaryDark : colors.border,
              },
            ]}
          >
            <Text
              variant="label"
              scale="sm"
              color={active ? 'textInverted' : 'textMuted'}
              weight={active ? 'bold' : 'normal'}
            >
              {formatValue(step)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// SegmentedPicker — generic picker
// ---------------------------------------------------------------------------

interface SegmentedPickerProps<T extends string | number> {
  testID?: string;
  value: T;
  options: readonly T[];
  formatValue: (v: T) => string;
  onChange: (v: T) => void;
}

/**
 * Generic segmented picker — used for text scale + color-blind mode.
 */
function SegmentedPicker<T extends string | number>({
  testID,
  value,
  options,
  formatValue,
  onChange,
}: SegmentedPickerProps<T>): React.JSX.Element {
  return (
    <View testID={testID} style={styles.sliderRow}>
      {options.map((opt) => {
        const active = opt === value;
        const bgColor: ColorKey = active ? 'primary' : 'border';
        return (
          <Pressable
            key={String(opt)}
            testID={`${testID}-option-${opt}`}
            accessibilityRole="adjustable"
            accessibilityLabel={formatValue(opt)}
            accessibilityState={{ selected: active }}
            onPress={() => onChange(opt)}
            style={[
              styles.sliderSegment,
              {
                backgroundColor: colors[bgColor],
                borderColor: active ? colors.primaryDark : colors.border,
              },
            ]}
          >
            <Text
              variant="label"
              scale="sm"
              color={active ? 'textInverted' : 'textMuted'}
              weight={active ? 'bold' : 'normal'}
            >
              {formatValue(opt)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// ToggleSwitch — on/off pill
// ---------------------------------------------------------------------------

interface ToggleSwitchProps {
  testID?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}

/**
 * Simple on/off toggle. The track is `colors.border` when off and
 * `colors.success` when on. The knob slides to the end when on.
 */
function ToggleSwitch({
  testID,
  value,
  onChange,
}: ToggleSwitchProps): React.JSX.Element {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel="reduce-motion-toggle"
      onPress={() => onChange(!value)}
      style={[styles.toggleTrack, value ? styles.trackOn : styles.trackOff]}
    >
      <View
        style={[
          styles.toggleKnob,
          value ? styles.toggleKnobOn : styles.toggleKnobOff,
        ]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  fieldLabel: {
    marginBottom: spacing.xs,
  },
  fieldLabelGap: {
    marginTop: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  rowText: {
    flex: 1,
    gap: spacing.xs,
  },
  footer: {
    alignItems: 'center',
    marginTop: spacing.md,
  },
  sliderRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  sliderSegment: {
    flex: 1,
    paddingVertical: spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: sizing.borderWidth,
    borderRadius: sizing.radiusSm,
  },
  toggleTrack: {
    width: sizing.iconMd * 2 + spacing.xs,
    height: sizing.iconMd + spacing.xs,
    borderRadius: sizing.radiusFull,
    padding: spacing.xs,
    justifyContent: 'center',
  },
  trackOn: {
    backgroundColor: colors.success,
  },
  trackOff: {
    backgroundColor: colors.border,
  },
  toggleKnob: {
    width: sizing.iconMd,
    height: sizing.iconMd,
    borderRadius: sizing.iconMd / 2,
    backgroundColor: colors.text,
  },
  // Logical: align the knob to the start when off, to the end when on.
  // In RTL, start/end flip automatically (marginStart is logical).
  toggleKnobOff: {
    marginStart: 0,
  },
  toggleKnobOn: {
    marginStart: sizing.iconMd + spacing.xs,
  },
});
