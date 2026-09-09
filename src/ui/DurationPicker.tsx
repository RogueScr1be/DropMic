import { Pressable, StyleSheet, Text, View } from 'react-native';

import { RECORDING_DURATIONS, type RecordingDuration } from '@/features/recording/recording-machine';
import { colors, minimumTouchTarget, radii, spacing, typography } from './theme';

export function DurationPicker({
  disabled = false,
  onChange,
  selected,
  stacked = false,
}: {
  disabled?: boolean;
  onChange: (duration: RecordingDuration) => void;
  selected: RecordingDuration;
  stacked?: boolean;
}) {
  return (
    <View accessibilityLabel="Recording duration" accessibilityRole="radiogroup" style={[styles.row, stacked && styles.stacked]} testID="duration-picker">
      {RECORDING_DURATIONS.map((duration) => {
        const isSelected = selected === duration;
        return (
          <Pressable
            aria-checked={isSelected}
            accessibilityHint={`Sets the Drop to ${duration} seconds`}
            accessibilityLabel={`${duration} seconds`}
            accessibilityRole="radio"
            accessibilityState={{ checked: isSelected, disabled, selected: isSelected }}
            disabled={disabled}
            key={duration}
            onPress={() => onChange(duration)}
            style={({ pressed }) => [styles.option, stacked && styles.stackedOption, isSelected && styles.selected, pressed && styles.pressed, disabled && styles.disabled]}>
            <Text maxFontSizeMultiplier={1.35} style={[styles.number, isSelected && styles.selectedText]}>{duration}</Text>
            <Text maxFontSizeMultiplier={1.35} style={[styles.unit, isSelected && styles.selectedUnit]}>seconds</Text>
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
});
