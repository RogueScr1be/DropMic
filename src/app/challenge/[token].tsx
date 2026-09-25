import { useEffect, useState } from 'react';
import { Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ChallengeServiceError, resolveChallenge } from '@/features/challenge/challenge-service';
import { trackEvent } from '@/features/analytics/analytics';
import { colors, radii, spacing, typography } from '@/ui/theme';

export default function ChallengeLandingScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(() => token ? 'loading' : 'error');
  const [prompt, setPrompt] = useState('');
  const [durationSeconds, setDurationSeconds] = useState<30 | 60 | 90>(30);
  const [error, setError] = useState(() => token ? '' : 'This challenge link is missing its token.');

  useEffect(() => {
    if (!token) {
      return;
    }
    void resolveChallenge(token).then((challenge) => {
      setPrompt(challenge.prompt);
      setDurationSeconds(challenge.durationSeconds);
      setStatus('ready');
      void trackEvent('challenge_link_opened');
    }).catch((reason) => {
      setStatus('error');
      setError(reason instanceof ChallengeServiceError ? reason.message : 'This challenge is unavailable.');
    });
  }, [token]);

  return <SafeAreaView style={styles.safe}><View style={styles.page}>
    <Text style={styles.kicker}>DROPMIC CHALLENGE</Text>
    <Text accessibilityRole="header" style={styles.title}>Your voice is up.</Text>
    {status === 'loading' && <Text style={styles.body}>Loading the prompt…</Text>}
    {status === 'error' && <><Text style={styles.body}>{error}</Text><Text style={styles.note}>Challenges are short, private speaking reps. Ask for a new link if this one has expired.</Text></>}
    {status === 'ready' && <>
      <Text style={styles.body}>Someone sent you a DropMic speaking challenge. Take {durationSeconds} seconds, then pass it on.</Text>
      <View style={styles.promptCard}><Text style={styles.promptLabel}>YOUR PROMPT</Text><Text style={styles.prompt}>{prompt}</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="Take the Challenge" onPress={() => { void trackEvent('challenge_accepted'); router.replace({ pathname: '/', params: { challenge: token } }); }} style={styles.primary}><Text style={styles.primaryText}>Take the Challenge</Text></Pressable>
    </>}
    <Text style={styles.footer}>Daily speaking reps with a dare mechanic.</Text>
  </View></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.background, flex: 1 },
  page: { flex: 1, gap: spacing.lg, justifyContent: 'center', padding: spacing.xxl },
  kicker: { color: colors.coral, ...typography.eyebrow },
  title: { color: colors.ink, fontFamily: typography.displayFamily, fontSize: 42, fontWeight: '700', lineHeight: 48 },
  body: { color: colors.muted, fontSize: 17, lineHeight: 25 },
  note: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  promptCard: { backgroundColor: colors.ink, borderRadius: radii.lg, gap: spacing.sm, padding: spacing.xl },
  promptLabel: { color: colors.coralSoft, ...typography.eyebrow },
  prompt: { color: colors.white, fontFamily: typography.displayFamily, fontSize: 27, fontWeight: '700', lineHeight: 34 },
  primary: { alignItems: 'center', backgroundColor: colors.ink, borderRadius: radii.md, justifyContent: 'center', minHeight: 60, paddingHorizontal: spacing.xl },
  primaryText: { color: colors.white, ...typography.label },
  footer: { color: colors.muted, fontSize: 12, marginTop: spacing.xl },
});
