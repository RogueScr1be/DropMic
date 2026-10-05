import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

import type { ChallengePreparationState } from './challenge-transition';
import { ActionButton } from '@/ui/ActionButton';
import { colors, spacing, typography } from '@/ui/theme';

export function ChallengeTransitionView({
  onDismiss,
  state,
}: {
  onDismiss: () => void;
  state: Extract<ChallengePreparationState, { status: 'preparing' | 'error' }>;
}) {
  const failed = state.status === 'error';

  return (
    <SafeAreaView style={styles.safe} testID="challenge-transition-view">
      <View style={styles.page}>
        <Text style={styles.kicker}>DROPMIC CHALLENGE</Text>
        <Text accessibilityRole="header" style={styles.title}>
          {failed ? 'This challenge needs another look.' : 'Preparing your challenge…'}
        </Text>
        <Text style={styles.body}>
          {failed ? state.message : 'Your challenge is readying safely. Please stay here for a moment.'}
        </Text>
        {failed && <ActionButton label="Back to DropMic" onPress={onDismiss} secondary />}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.background, flex: 1 },
  page: { flex: 1, gap: spacing.lg, justifyContent: 'center', padding: spacing.xxl },
  kicker: { color: colors.coral, ...typography.eyebrow },
  title: { color: colors.ink, ...typography.displayMedium },
  body: { color: colors.muted, ...typography.body },
});
