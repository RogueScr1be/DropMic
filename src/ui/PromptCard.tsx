import { StyleSheet, Text, View } from 'react-native';

import { colors, radii, shadows, spacing, typography } from './theme';

export function PromptCard({ prompt }: { prompt: string }) {
  return (
    <View accessibilityLabel={`Speaking prompt: ${prompt}`} style={styles.card} testID="speaking-prompt">
      <Text accessibilityElementsHidden maxFontSizeMultiplier={1} style={styles.quote}>“</Text>
      <Text maxFontSizeMultiplier={1.5} style={styles.prompt}>{prompt}</Text>
      <Text accessibilityElementsHidden maxFontSizeMultiplier={1} style={[styles.quote, styles.quoteClose]}>”</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.lg, borderWidth: 1, gap: spacing.xs, padding: spacing.xxl, paddingBottom: spacing.xxxl, paddingRight: spacing.xxxl, ...shadows.card },
  quote: { color: colors.coral, fontFamily: typography.displayFamily, fontSize: 42, height: 27, lineHeight: 42 },
  quoteClose: { alignSelf: 'flex-end' },
  prompt: { color: colors.inkStrong, fontFamily: typography.displayFamily, ...typography.title },
});
