import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Head from 'expo-router/head';

import { ChallengeServiceError, resolveChallenge } from '@/features/challenge/challenge-service';
import { ChallengeTransitionView } from '@/features/challenge/ChallengeTransitionView';
import { type ChallengeTransitionStage } from '@/features/challenge/challenge-transition';
import {
  buildNativeChallengeUrl,
  clearPendingChallenge,
  confirmPendingChallenge,
  parseChallengeUrl,
  savePendingChallenge,
} from '@/features/challenge/challenge-routing';
import { trackEvent } from '@/features/analytics/analytics';
import { colors, radii, spacing, typography } from '@/ui/theme';

export default function ChallengeLandingScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const router = useRouter();
  const [routeToken, setRouteToken] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [prompt, setPrompt] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [durationSeconds, setDurationSeconds] = useState<30 | 60 | 90>(30);
  const [error, setError] = useState('');
  const [launching, setLaunching] = useState(false);
  const [launchUnavailable, setLaunchUnavailable] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const reportTransitionStage = (stage: ChallengeTransitionStage) => {
    if (__DEV__) {
      console.info(`[DropMic] challenge transition: ${stage}`);
    }
  };

  useEffect(() => {
    const fallbackToken = typeof token === 'string'
      ? parseChallengeUrl(`https://thedropmic.com/challenge/${encodeURIComponent(token)}`)?.token ?? null
      : null;
    if (Platform.OS === 'web') {
      void Promise.resolve().then(() => setRouteToken(fallbackToken));
      return;
    }

    let cancelled = false;
    const applyUrl = (value: string | null) => {
      const parsed = value ? parseChallengeUrl(value) : null;
      if (!cancelled && parsed) {
        setRouteToken(parsed.token);
      }
    };
    void Linking.getInitialURL().then(applyUrl);
    const subscription = Linking.addEventListener('url', ({ url }) => applyUrl(url));
    if (fallbackToken) {
      void Promise.resolve().then(() => setRouteToken(fallbackToken));
    }
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [token]);

  useEffect(() => {
    if (!routeToken) {
      void Promise.resolve().then(() => {
        setStatus('error');
        setError('This challenge link is missing or malformed.');
      });
      return;
    }
    let cancelled = false;
    void resolveChallenge(routeToken).then(async (challenge) => {
      if (cancelled) {
        return;
      }
      setPrompt(challenge.prompt);
      setCategory(challenge.category);
      setDurationSeconds(challenge.durationSeconds);
      if (Platform.OS !== 'web') {
        const parsed = parseChallengeUrl(`micdrop://challenge/${routeToken}`);
        if (parsed) {
          await savePendingChallenge(parsed);
        }
      }
      setStatus('ready');
      void trackEvent('challenge_link_opened');
    }).catch((reason) => {
      if (cancelled) {
        return;
      }
      setStatus('error');
      setError(reason instanceof ChallengeServiceError ? reason.message : 'This challenge is unavailable.');
      if (Platform.OS !== 'web') {
        void clearPendingChallenge();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [routeToken]);

  const confirmNativeChallenge = async () => {
    if (!routeToken || confirming) {
      return;
    }
    setConfirming(true);
    reportTransitionStage('confirmation_pressed');
    try {
      const confirmed = await confirmPendingChallenge(routeToken);
      if (!confirmed) {
        await savePendingChallenge({ source: 'micdrop', token: routeToken }, 'confirmed');
      }
      reportTransitionStage('pending_state_saved');
      reportTransitionStage('root_transition_started');
      router.replace({ pathname: '/', params: { challenge: routeToken, challengeConfirmed: '1' } });
    } catch {
      setError('This challenge could not be prepared. Try the link again.');
      setConfirming(false);
      reportTransitionStage('transition_failed');
    }
  };

  const cancelNativeChallenge = () => {
    void clearPendingChallenge();
    router.replace('/');
  };

  const openNativeChallenge = async () => {
    if (!routeToken || launching) {
      return;
    }
    setLaunching(true);
    setLaunchUnavailable(false);
    try {
      const nativeUrl = buildNativeChallengeUrl(routeToken);
      if (!(await Linking.canOpenURL(nativeUrl))) {
        setLaunchUnavailable(true);
        return;
      }
      await Linking.openURL(nativeUrl);
      if (typeof document !== 'undefined') {
        let hidden = document.visibilityState !== 'visible';
        const onVisibilityChange = () => {
          hidden = document.visibilityState !== 'visible';
        };
        document.addEventListener('visibilitychange', onVisibilityChange);
        await new Promise((resolve) => setTimeout(resolve, 1500));
        document.removeEventListener('visibilitychange', onVisibilityChange);
        if (!hidden && document.visibilityState === 'visible') {
          setLaunchUnavailable(true);
        }
      }
    } catch {
      setLaunchUnavailable(true);
    } finally {
      setLaunching(false);
    }
  };

  if (Platform.OS !== 'web' && status === 'ready') {
    return (
      <NativeChallengeConfirmation
        category={category}
        confirming={confirming}
        durationSeconds={durationSeconds}
        onCancel={cancelNativeChallenge}
        onConfirm={() => void confirmNativeChallenge()}
        prompt={prompt}
      />
    );
  }

  return <>
    <Head><meta name="robots" content="noindex, nofollow" /></Head>
    <SafeAreaView style={styles.safe}><View style={styles.page}>
      <Text style={styles.kicker}>DROPMIC CHALLENGE</Text>
      <Text accessibilityRole="header" style={styles.title}>Your voice is up.</Text>
      {status === 'loading' && <Text style={styles.body}>Loading the prompt…</Text>}
      {status === 'error' && <><Text style={styles.body}>{error}</Text><Text style={styles.note}>Challenges are short, private speaking reps. Ask for a new link if this one has expired.</Text></>}
      {status === 'ready' && <>
        <Text style={styles.body}>Someone sent you a DropMic speaking challenge. Take {durationSeconds} seconds, then pass it on.</Text>
        <View style={styles.promptCard}><Text style={styles.promptLabel}>YOUR PROMPT</Text><Text style={styles.prompt}>{prompt}</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Take the Challenge" disabled={launching} onPress={() => void openNativeChallenge()} style={styles.primary}><Text style={styles.primaryText}>{launching ? 'Opening DropMic…' : 'Take the Challenge'}</Text></Pressable>
        {launchUnavailable && <Text style={styles.note}>DropMic is not available on this device. This challenge page remains open and no response was started.</Text>}
      </>}
      <Text style={styles.footer}>Daily speaking reps with a dare mechanic.</Text>
    </View></SafeAreaView>
  </>;
}

export function ErrorBoundary({ retry }: { retry: () => void }) {
  return (
    <ChallengeTransitionView
      onDismiss={retry}
      state={{
        message: 'DropMic could not display this challenge safely.',
        stage: 'transition_failed',
        status: 'error',
      }}
    />
  );
}

function NativeChallengeConfirmation({
  category,
  confirming,
  durationSeconds,
  onCancel,
  onConfirm,
  prompt,
}: {
  category: string | null;
  confirming: boolean;
  durationSeconds: 30 | 60 | 90;
  onCancel: () => void;
  onConfirm: () => void;
  prompt: string;
}) {
  return <SafeAreaView style={styles.safe}><View style={styles.page}>
    <Text style={styles.kicker}>DROPMIC CHALLENGE</Text>
    <Text accessibilityRole="header" style={styles.title}>Ready when you are.</Text>
    <Text style={styles.body}>Review the prompt before you decide to record.</Text>
    <View style={styles.promptCard}><Text style={styles.promptLabel}>YOUR PROMPT</Text><Text style={styles.prompt}>{prompt}</Text></View>
    <Text accessibilityLabel={`Challenge details: ${category ?? 'Challenge'}, ${durationSeconds} seconds`} style={styles.body}>{category ?? 'Challenge'} · {durationSeconds} seconds</Text>
    <Pressable accessibilityRole="button" accessibilityLabel="Take the Challenge" disabled={confirming} onPress={onConfirm} style={styles.primary}><Text style={styles.primaryText}>{confirming ? 'Preparing…' : 'Take the Challenge'}</Text></Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Cancel challenge" disabled={confirming} onPress={onCancel} style={styles.secondary}><Text style={styles.secondaryText}>Back</Text></Pressable>
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
  secondary: { alignItems: 'center', borderColor: colors.ink, borderRadius: radii.md, borderWidth: 1, justifyContent: 'center', minHeight: 54, paddingHorizontal: spacing.xl },
  secondaryText: { color: colors.ink, ...typography.label },
  footer: { color: colors.muted, fontSize: 12, marginTop: spacing.xl },
});
