import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MicFlowSnapshot } from './mic-flow-service';
import { formatFlowCount, presentationForStatus } from './mic-flow-presentation';

export function MicFlowCard({ loading, snapshot }: { loading: boolean; snapshot: MicFlowSnapshot | null }) {
  const [expanded, setExpanded] = useState(false);
  const presentation = snapshot ? presentationForStatus(snapshot.status) : null;
  const summary = loading
    ? 'Checking…'
    : !snapshot
      ? 'Unavailable'
      : presentation?.showCurrent
        ? `Mic Flow: ${formatFlowCount(snapshot.current_flow)}`
        : presentation?.title;

  return (
    <View style={styles.card} testID={loading ? 'mic-flow-card-loading' : snapshot ? 'mic-flow-card' : 'mic-flow-card-unavailable'}>
      <Pressable
        accessibilityHint={expanded ? 'Hides your Mic Flow details' : 'Shows your Mic Flow details'}
        accessibilityLabel={expanded ? 'Collapse Mic Flow details' : 'Expand Mic Flow details'}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        aria-expanded={expanded}
        onPress={() => setExpanded((current) => !current)}
        style={({ pressed }) => [styles.summary, pressed && styles.pressed]}
        testID="mic-flow-toggle">
        <Text style={styles.kicker}>MIC FLOW</Text>
        <Text accessibilityLiveRegion={loading ? 'polite' : 'none'} style={styles.summaryText}>{summary}</Text>
        <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.disclosureMark}>
          {expanded ? '−' : '+'}
        </Text>
      </Pressable>

      {expanded && (
        <View accessibilityLabel="Mic Flow details" style={styles.expandedDetails} testID="mic-flow-details">
          {loading ? (
            <Text style={styles.unavailableTitle}>Checking your Mic Flow…</Text>
          ) : !snapshot || !presentation ? (
            <>
              <Text style={styles.unavailableTitle}>Mic Flow is unavailable right now.</Text>
              <Text style={styles.body}>We’ll check again when you’re connected.</Text>
            </>
          ) : (
            <>
              <Text accessibilityRole="header" style={styles.title}>{presentation.title}</Text>
              <Text style={styles.body}>{presentation.body}</Text>
              <View style={styles.details}>
                <View>
                  <Text style={styles.detailLabel}>BEST</Text>
                  <Text style={styles.detailValue}>{formatFlowCount(snapshot.best_flow)}</Text>
                </View>
                <View>
                  <Text style={styles.detailLabel}>MIC SAVES</Text>
                  <Text style={styles.detailValue}>{snapshot.saves_available}</Text>
                </View>
              </View>
            </>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fffaf2', borderColor: '#ded1c1', borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  summary: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 52, paddingHorizontal: 16, paddingVertical: 10 },
  kicker: { color: '#e4572e', fontSize: 10, fontWeight: '900', letterSpacing: 1.8 },
  summaryText: { color: '#18332d', flex: 1, fontSize: 12, fontWeight: '800', textAlign: 'right' },
  disclosureMark: { color: '#e4572e', fontSize: 22, fontWeight: '700', lineHeight: 24, textAlign: 'center', width: 44 },
  expandedDetails: { borderTopColor: '#ded1c1', borderTopWidth: 1, gap: 9, padding: 16 },
  title: { color: '#18332d', fontFamily: 'Georgia', fontSize: 22, fontWeight: '700', lineHeight: 27 },
  unavailableTitle: { color: '#526c63', fontFamily: 'Georgia', fontSize: 20, fontWeight: '700', lineHeight: 25 },
  body: { color: '#526c63', fontSize: 14, lineHeight: 20 },
  details: { borderTopColor: '#ded1c1', borderTopWidth: 1, flexDirection: 'row', gap: 28, marginTop: 4, paddingTop: 11 },
  detailLabel: { color: '#799087', fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  detailValue: { color: '#18332d', fontFamily: 'Georgia', fontSize: 18, fontWeight: '700', marginTop: 2 },
  pressed: { opacity: 0.72 },
});
