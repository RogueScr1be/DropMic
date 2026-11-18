import { StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing, typography } from '@/ui/theme';

export function ShareCard({
  challengeUrl,
  dropScore,
  prompt,
}: {
  challengeUrl?: string;
  dropScore?: number | null;
  prompt: string;
}) {
  return <View accessibilityLabel="DropMic share card" style={styles.card}>
    <View style={styles.brandRow}><Text style={styles.brand}>DropMic</Text></View>
    <Text style={styles.prompt}>{prompt}</Text>
    {typeof dropScore === 'number' && <View style={styles.resultRow}>
      {typeof dropScore === 'number' && <View><Text style={styles.label}>DROP SCORE</Text><Text style={styles.score}>{dropScore}%</Text></View>}
    </View>}
    <Text style={styles.cta}>Your turn: take the prompt.</Text>
    {challengeUrl && <Text numberOfLines={1} style={styles.url}>{challengeUrl}</Text>}
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.ink, borderRadius: radii.lg, gap: spacing.lg, overflow: 'hidden', padding: spacing.xl },
  brandRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  brand: { color: colors.white, fontFamily: typography.displayFamily, fontSize: 23, fontWeight: '700' },
  prompt: { color: colors.white, fontFamily: typography.displayFamily, fontSize: 25, fontWeight: '700', lineHeight: 32 },
  resultRow: { borderColor: colors.boardRail, borderTopWidth: 1, flexDirection: 'row', gap: spacing.xxl, paddingTop: spacing.lg },
  label: { color: colors.coralSoft, ...typography.eyebrow },
  value: { color: colors.white, fontSize: 15, fontWeight: '800', marginTop: spacing.xs },
  score: { color: colors.white, fontFamily: typography.displayFamily, fontSize: 23, fontWeight: '700', marginTop: spacing.xs },
  cta: { color: colors.successSoft, fontSize: 14, fontWeight: '800' },
  url: { color: colors.coralSoft, fontSize: 11 },
});
