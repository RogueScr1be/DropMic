import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, minimumTouchTarget, spacing, typography } from './theme';

export function AppHeader({ onBack }: { onBack?: () => void }) {
  return (
    <View accessibilityRole="header" style={styles.header}>
      {onBack ? (
        <Pressable
          accessibilityHint="Returns to the same prompt"
          accessibilityLabel="Back to prompt"
          accessibilityRole="button"
          onPress={onBack}
          style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
          <Text maxFontSizeMultiplier={1.5} style={styles.backArrow}>‹</Text>
          <Text maxFontSizeMultiplier={1.5} style={styles.backText}>Back</Text>
        </Pressable>
      ) : (
        <Text accessibilityRole="header" maxFontSizeMultiplier={1.5} style={styles.brand}>DropMic</Text>
      )}
      {onBack && <Text accessibilityRole="header" maxFontSizeMultiplier={1.5} style={styles.centerBrand}>DropMic</Text>}
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.futureActionSlot} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { alignItems: 'center', flexDirection: 'row', minHeight: minimumTouchTarget, position: 'relative' },
  brand: { color: colors.ink, fontFamily: typography.displayFamily, fontSize: 24, fontWeight: '700', letterSpacing: -0.6 },
  centerBrand: { color: colors.ink, fontFamily: typography.displayFamily, fontSize: 21, fontWeight: '700', left: minimumTouchTarget + spacing.sm, position: 'absolute', right: minimumTouchTarget + spacing.sm, textAlign: 'center' },
  back: { alignItems: 'center', flexDirection: 'row', gap: spacing.xs, minHeight: minimumTouchTarget, minWidth: 76, zIndex: 1 },
  backArrow: { color: colors.ink, fontSize: 32, lineHeight: 34 },
  backText: { color: colors.ink, ...typography.label },
  futureActionSlot: { marginLeft: 'auto', minHeight: minimumTouchTarget, width: minimumTouchTarget },
  pressed: { opacity: 0.62 },
});
