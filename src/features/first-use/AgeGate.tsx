import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionButton } from '@/ui/ActionButton';
import { colors, minimumTouchTarget, radii, shadows, spacing, typography } from '@/ui/theme';

export function AgeGate({ onAccept }: { onAccept: () => Promise<void> }) {
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = async () => {
    if (!confirmed || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onAccept();
    } catch {
      setError('We could not save your confirmation. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.wrap} testID="age-gate">
      <View style={styles.card}>
        <Text maxFontSizeMultiplier={1.5} style={styles.eyebrow}>BEFORE YOUR FIRST DROP</Text>
        <Text accessibilityRole="header" maxFontSizeMultiplier={1.5} style={styles.title}>One quick check.</Text>
        <Text style={styles.body}>DropMic is for speakers age 13 and older.</Text>
        <Pressable
          accessibilityHint="Required to continue to your first prompt"
          accessibilityLabel="I confirm I am 13 or older"
          accessibilityRole="checkbox"
          accessibilityState={{ checked: confirmed }}
          onPress={() => setConfirmed((value) => !value)}
          style={({ pressed }) => [styles.checkRow, pressed && styles.pressed]}>
          <View style={[styles.checkbox, confirmed && styles.checkboxSelected]}>
            {confirmed && <Text maxFontSizeMultiplier={1} style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.checkLabel}>I confirm I am 13 or older.</Text>
        </Pressable>
        {error && <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
        <ActionButton
          accessibilityHint="Opens today’s speaking prompt"
          disabled={!confirmed || busy}
          label={busy ? 'Saving…' : 'Continue'}
          onPress={() => void accept()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: 'center', paddingVertical: spacing.xxxl },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.lg, borderWidth: 1, gap: spacing.xl, padding: spacing.xxl, ...shadows.card },
  eyebrow: { color: colors.coral, ...typography.eyebrow },
  title: { color: colors.inkStrong, fontFamily: typography.displayFamily, ...typography.displayMedium },
  body: { color: colors.muted, fontFamily: typography.bodyFamily, ...typography.body },
  checkRow: { alignItems: 'center', flexDirection: 'row', gap: spacing.md, minHeight: minimumTouchTarget },
  checkbox: { alignItems: 'center', borderColor: colors.border, borderRadius: radii.sm, borderWidth: 2, height: 26, justifyContent: 'center', width: 26 },
  checkboxSelected: { backgroundColor: colors.ink, borderColor: colors.ink },
  checkmark: { color: colors.successSoft, fontSize: 17, fontWeight: '900' },
  checkLabel: { color: colors.ink, flex: 1, fontFamily: typography.bodyFamily, ...typography.body },
  error: { backgroundColor: colors.dangerSoft, borderRadius: radii.sm, color: colors.danger, padding: spacing.md, ...typography.body },
  pressed: { opacity: 0.7 },
});
