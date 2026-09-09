import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, minimumTouchTarget, radii, spacing, typography } from './theme';

export function ActionButton({
  accessibilityHint,
  compact = false,
  disabled = false,
  label,
  onPress,
  secondary = false,
  testID,
}: {
  accessibilityHint?: string;
  compact?: boolean;
  disabled?: boolean;
  label: string;
  onPress: () => void;
  secondary?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityHint={accessibilityHint}
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        compact && styles.compact,
        secondary && styles.secondary,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}>
      <Text maxFontSizeMultiplier={1.5} style={[styles.label, secondary && styles.secondaryLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', backgroundColor: colors.ink, borderColor: colors.ink, borderRadius: radii.md, borderWidth: 1, justifyContent: 'center', minHeight: 60, paddingHorizontal: spacing.xl, width: '100%' },
  compact: { flex: 1, minHeight: minimumTouchTarget, width: undefined },
  secondary: { backgroundColor: 'transparent', borderColor: colors.border },
  label: { color: colors.white, textAlign: 'center', ...typography.label },
  secondaryLabel: { color: colors.ink },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.45 },
});
