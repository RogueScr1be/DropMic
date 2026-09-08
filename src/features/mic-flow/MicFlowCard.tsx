import { StyleSheet, Text, View } from 'react-native';

import type { MicFlowSnapshot } from './mic-flow-service';
import { formatFlowCount, presentationForStatus } from './mic-flow-presentation';

export function MicFlowCard({ loading, snapshot }: { loading: boolean; snapshot: MicFlowSnapshot | null }) {
  if (loading) {
    return (
      <View accessibilityLabel="Mic Flow loading" style={styles.card} testID="mic-flow-card-loading">
        <Text style={styles.kicker}>MIC FLOW</Text>
        <Text accessibilityLiveRegion="polite" style={styles.unavailableTitle}>Checking your Mic Flow…</Text>
      </View>
    );
  }

  if (!snapshot) {
    return (
      <View accessibilityLabel="Mic Flow unavailable" style={styles.card} testID="mic-flow-card-unavailable">
        <Text style={styles.kicker}>MIC FLOW</Text>
        <Text style={styles.unavailableTitle}>Mic Flow is unavailable right now.</Text>
        <Text style={styles.body}>We’ll check again when you’re connected.</Text>
      </View>
    );
  }

  const presentation = presentationForStatus(snapshot.status);
  return (
    <View accessibilityLabel={`Mic Flow, ${snapshot.status.replace(/_/g, ' ')}`} style={styles.card} testID="mic-flow-card">
      <View style={styles.header}>
        <Text style={styles.kicker}>MIC FLOW</Text>
        {presentation.showCurrent && <Text style={styles.current}>{`Mic Flow: ${formatFlowCount(snapshot.current_flow)}`}</Text>}
      </View>
      <Text accessibilityRole="header" style={styles.title}>{presentation.title}</Text>
      <Text style={styles.body}>{presentation.body}</Text>
      <View accessibilityLabel="Mic Flow details" style={styles.details}>
        <View>
          <Text style={styles.detailLabel}>BEST</Text>
          <Text style={styles.detailValue}>{formatFlowCount(snapshot.best_flow)}</Text>
        </View>
        <View>
          <Text style={styles.detailLabel}>MIC SAVES</Text>
          <Text style={styles.detailValue}>{snapshot.saves_available}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fffaf2', borderColor: '#ded1c1', borderRadius: 16, borderWidth: 1, gap: 9, padding: 16 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  kicker: { color: '#e4572e', fontSize: 10, fontWeight: '900', letterSpacing: 1.8 },
  current: { color: '#18332d', fontSize: 12, fontWeight: '800' },
  title: { color: '#18332d', fontFamily: 'Georgia', fontSize: 22, fontWeight: '700', lineHeight: 27 },
  unavailableTitle: { color: '#526c63', fontFamily: 'Georgia', fontSize: 20, fontWeight: '700', lineHeight: 25 },
  body: { color: '#526c63', fontSize: 14, lineHeight: 20 },
  details: { borderTopColor: '#ded1c1', borderTopWidth: 1, flexDirection: 'row', gap: 28, marginTop: 4, paddingTop: 11 },
  detailLabel: { color: '#799087', fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  detailValue: { color: '#18332d', fontFamily: 'Georgia', fontSize: 18, fontWeight: '700', marginTop: 2 },
});
