import { Pressable, StyleSheet, Text, View } from 'react-native';

import { RECORDING_DURATIONS, type RecordingDuration } from '@/features/recording/recording-machine';
import { colors, minimumTouchTarget, radii, spacing, typography } from './theme';

export function DurationPicker({
  disabled = false,
  onChange,
  onUpgrade,
  plusEnabled = true,
  selected,
  stacked = false,
}: {
  disabled?: boolean;
  onChange: (duration: RecordingDuration) => void;
  onUpgrade?: () => void;
  plusEnabled?: boolean;
  selected: RecordingDuration;
  stacked?: boolean;
}) {
  return (
    <View accessibilityLabel="Recording duration" accessibilityRole="radiogroup" style={[styles.row, stacked && styles.stacked]} testID="duration-picker">
      {RECORDING_DURATIONS.map((duration) => {
        const isSelected = selected === duration;
        const locked = !plusEnabled && duration !== 30;
        return (
          <Pressable
            aria-checked={isSelected}
            accessibilityHint={locked ? 'Opens DropMic Plus to unlock this duration' : `Sets the Drop to ${duration} seconds`}
            accessibilityLabel={`${duration} seconds`}
            accessibilityRole="radio"
            accessibilityState={{ checked: isSelected, disabled: disabled || locked, selected: isSelected }}
            disabled={disabled}
            key={duration}
            onPress={() => locked ? onUpgrade?.() : onChange(duration)}
            style={({ pressed }) => [styles.option, stacked && styles.stackedOption, isSelected && styles.selected, locked && styles.locked, pressed && styles.pressed, disabled && styles.disabled]}>
            <Text maxFontSizeMultiplier={1.35} style={[styles.number, isSelected && styles.selectedText]}>{duration}</Text>
            <Text maxFontSizeMultiplier={1.35} style={[styles.unit, isSelected && styles.selectedUnit]}>seconds</Text>
            {locked && <Text style={styles.lockedLabel}>PLUS</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.sm },
  stacked: { flexDirection: 'column' },
  option: { alignItems: 'center', backgroundColor: colors.surfaceMuted, borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 88, minWidth: minimumTouchTarget, padding: spacing.sm, position: 'relative' },
  stackedOption: { flexDirection: 'row', gap: spacing.sm, minHeight: 58 },
  selected: { backgroundColor: colors.ink, borderColor: colors.ink },
  number: { color: colors.ink, fontFamily: typography.displayFamily, fontSize: 27, fontWeight: '700' },
  unit: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  selectedText: { color: colors.white },
  selectedUnit: { color: colors.successSoft },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.55 },
  locked: { opacity: 0.68 },
  lockedLabel: { color: colors.coral, fontSize: 9, fontWeight: '900', letterSpacing: 1, marginTop: 4 },
});
