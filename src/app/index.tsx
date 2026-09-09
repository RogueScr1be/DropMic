import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Animated, Modal, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { SignupFlow } from '@/features/auth/SignupFlow';
import { clearUnclaimedAttempt, getUnclaimedAttempt, saveUnclaimedAttempt, type UnclaimedAttempt } from '@/features/auth/auth-recovery';
import { claimUnclaimedAttempt, getSession } from '@/features/auth/auth-service';
import { isSupabaseConfigured, supabase } from '@/features/auth/auth-client';
import {
  establishAnonymousMicFlowSession,
  createMicFlowSnapshotCoordinator,
  getMicFlowOwnerId,
  recordMicFlowCompletion,
  type MicFlowCompletion,
  type MicFlowRecordingIdentity,
  type MicFlowSnapshot,
} from '@/features/mic-flow/mic-flow-service';
import { MicFlowCard } from '@/features/mic-flow/MicFlowCard';
import { bindRevenueCatSession } from '@/features/billing/revenuecat-session';
import { AgeGate } from '@/features/first-use/AgeGate';
import { firstScreenAfterSplash, PREPARATION_COUNTDOWN_MS, SPLASH_DURATION_MS, formatCountdownNumber, formatSpeakingTime, phaseForRecordingState, type FirstUsePhase } from '@/features/first-use/first-use-flow';
import { hasAcceptedAgeGate, saveAgeGateAcceptance } from '@/features/first-use/first-run-storage';
import { SplashReveal } from '@/features/first-use/SplashReveal';
import { useReducedMotion } from '@/features/first-use/use-reduced-motion';
import { QuickReadFlow } from '@/features/quick-read/QuickReadFlow';
import { createTakeIdentity, type TakeIdentity } from '@/features/quick-read/attempt-identity';
import { createTakeTwoTake } from '@/features/quick-read/take-two-journey';
import { useLocalAudioRecorder } from '@/features/recording/use-local-audio-recorder';
import {
  deriveElapsedMs,
  isInterruptibleState,
  isRecordingState,
  type RecordingDuration,
} from '@/features/recording/recording-machine';
import { useRecordingStore } from '@/features/recording/recording-store';
import { detectWebRecordingMimeType } from '@/features/recording/web-recording-format';
import { selectNextTopic, type SpeakingTopic } from '@/features/topics/topic-catalog';
import { SolariBoard } from '@/features/solari/SolariBoard';
import { ActionButton } from '@/ui/ActionButton';
import { AppHeader } from '@/ui/AppHeader';
import { AppShell } from '@/ui/AppShell';
import { DurationPicker } from '@/ui/DurationPicker';
import { PromptCard } from '@/ui/PromptCard';
import { colors, radii, spacing, typography } from '@/ui/theme';

type ExperiencePhase = FirstUsePhase | 'interrupted' | 'error';

export default function AudioProofScreen() {
  const audio = useLocalAudioRecorder();
  const { auth } = useLocalSearchParams<{ auth?: string }>();
  const reducedMotion = useReducedMotion();
  const recordingState = useRecordingStore((store) => store.state);
  const selectedDurationSeconds = useRecordingStore((store) => store.selectedDurationSeconds);
  const startedAtMs = useRecordingStore((store) => store.startedAtMs);
  const completedAtMs = useRecordingStore((store) => store.completedAtMs);
  const recordingUri = useRecordingStore((store) => store.recordingUri);
  const recordingError = useRecordingStore((store) => store.error);
  const elapsedMs = useRecordingStore((store) => store.elapsedMs);
  const nowMs = useRecordingStore((store) => store.nowMs);
  const dispatch = useRecordingStore((store) => store.dispatch);
  const setNow = useRecordingStore((store) => store.setNow);
  const [phase, setPhase] = useState<ExperiencePhase>('splash');
  const [ageGateAccepted, setAgeGateAccepted] = useState<boolean | null>(null);
  const [splashElapsed, setSplashElapsed] = useState(false);
  const [topic, setTopic] = useState<SpeakingTopic>(() => selectNextTopic(null));
  const [revealKey, setRevealKey] = useState(0);
  const [countdownStartedAtMs, setCountdownStartedAtMs] = useState<number | null>(null);
  const [countdownNowMs, setCountdownNowMs] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [recoveryAttempt, setRecoveryAttempt] = useState<UnclaimedAttempt | null>(null);
  const [serverAttemptId, setServerAttemptId] = useState<string | null>(null);
  const [isAuthFlowVisible, setIsAuthFlowVisible] = useState(auth === 'complete');
  const [isQuickReadVisible, setIsQuickReadVisible] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [takeIdentity, setTakeIdentity] = useState<TakeIdentity>(() => createTakeIdentity());
  const [takeTwoBaselineRunId, setTakeTwoBaselineRunId] = useState<string | null>(null);
  const [micFlowStatus, setMicFlowStatus] = useState<'idle' | 'pending' | 'protected' | 'unprotected' | 'save_decision_required'>('idle');
  const [micFlowSnapshot, setMicFlowSnapshot] = useState<MicFlowSnapshot | null>(null);
  const [micFlowSnapshotLoading, setMicFlowSnapshotLoading] = useState(false);
  const [micFlowSavePromptVisible, setMicFlowSavePromptVisible] = useState(false);
  const [micFlowCompletionMessage, setMicFlowCompletionMessage] = useState<string | null>(null);
  const stopInFlight = useRef(false);
  const startInFlight = useRef(false);
  const operationGeneration = useRef(0);
  const countdownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const takeIdentityRef = useRef(takeIdentity);
  const takeTwoStartInFlight = useRef(false);
  const micFlowCompletionRef = useRef<string | null>(null);
  const micFlowIdentityRef = useRef<MicFlowRecordingIdentity | null>(null);
  const micFlowIdentityGenerationRef = useRef(0);
  const pendingMicFlowCompletionRef = useRef<{ input: MicFlowCompletion; identity: MicFlowRecordingIdentity; generation: number } | null>(null);
  const micFlowDecisionInFlight = useRef(false);
  const micFlowSnapshotRequestRef = useRef(0);
  const micFlowSnapshotCoordinatorRef = useRef(createMicFlowSnapshotCoordinator());

  const elapsed = useMemo(
    () => deriveElapsedMs(startedAtMs, nowMs, selectedDurationSeconds * 1000),
    [nowMs, selectedDurationSeconds, startedAtMs],
  );
  const statePhase = phaseForRecordingState(recordingState);
  const firstUsePhase = phase === 'splash' && splashElapsed && ageGateAccepted !== null
    ? firstScreenAfterSplash(ageGateAccepted)
    : phase;
  const displayedPhase: ExperiencePhase =
    statePhase ??
    (recordingState === 'interrupted'
      ? 'interrupted'
      : recordingState === 'error'
        ? 'error'
        : firstUsePhase);

  const currentAttempt = useMemo<UnclaimedAttempt | null>(() => {
    if (recordingState !== 'completed' || completedAtMs === null) {
      return null;
    }
    return {
      audioRetained: false,
      clientAttemptId: takeIdentity.clientAttemptId,
      completedAt: new Date(completedAtMs).toISOString(),
      completedDurationSeconds: Math.round(elapsedMs / 1000),
      selectedDurationSeconds,
      topicId: topic.id,
    };
  }, [completedAtMs, elapsedMs, recordingState, selectedDurationSeconds, takeIdentity.clientAttemptId, topic.id]);

  useEffect(() => {
    let cancelled = false;
    void hasAcceptedAgeGate().then((accepted) => {
      if (!cancelled) {
        setAgeGateAccepted(accepted);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setSplashElapsed(true), reducedMotion ? 0 : SPLASH_DURATION_MS);
    return () => clearTimeout(timer);
  }, [reducedMotion]);

  const refreshRecoveryAttempt = useCallback(async () => {
    setRecoveryAttempt(await getUnclaimedAttempt());
  }, []);

  const refreshMicFlowSnapshot = useCallback(async (options?: { force?: boolean; ownerId?: string | null }) => {
    const requestId = ++micFlowSnapshotRequestRef.current;
    setMicFlowSnapshotLoading(true);
    const ownerId = options && Object.prototype.hasOwnProperty.call(options, 'ownerId')
      ? options.ownerId ?? null
      : await getMicFlowOwnerId();
    if (!ownerId) {
      micFlowSnapshotCoordinatorRef.current.invalidate();
      if (requestId === micFlowSnapshotRequestRef.current) {
        setMicFlowSnapshot(null);
        setMicFlowSnapshotLoading(false);
      }
      return;
    }
    const snapshot = await micFlowSnapshotCoordinatorRef.current.refresh(ownerId, { force: options?.force });
    if (requestId !== micFlowSnapshotRequestRef.current) {
      return;
    }
    setMicFlowSnapshot(snapshot);
    setMicFlowSnapshotLoading(false);
  }, []);

  const handleMicFlowAuthTransition = useCallback((session: Awaited<ReturnType<typeof getSession>>) => {
    const nextOwnerId = session?.user?.id ?? null;
    const captured = micFlowIdentityRef.current;
    micFlowIdentityGenerationRef.current += 1;
    micFlowIdentityRef.current = null;
    pendingMicFlowCompletionRef.current = null;
    micFlowSnapshotCoordinatorRef.current.transition(nextOwnerId);
    micFlowSnapshotRequestRef.current += 1;
    setMicFlowSnapshot(null);
    setMicFlowSnapshotLoading(Boolean(nextOwnerId));
    setMicFlowCompletionMessage(null);
    if (captured && captured.userId !== nextOwnerId) {
      setMicFlowStatus('unprotected');
    }
  }, []);

  useEffect(() => {
    void getUnclaimedAttempt().then(setRecoveryAttempt);
  }, [refreshRecoveryAttempt]);

  useEffect(() => {
    return bindRevenueCatSession();
  }, []);

  useEffect(() => {
    const refreshTimer = setTimeout(() => void refreshMicFlowSnapshot(), 0);
    return () => clearTimeout(refreshTimer);
  }, [refreshMicFlowSnapshot]);

  useEffect(() => {
    return () => {
      micFlowIdentityGenerationRef.current += 1;
      micFlowIdentityRef.current = null;
      pendingMicFlowCompletionRef.current = null;
      micFlowSnapshotRequestRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      return;
    }
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      handleMicFlowAuthTransition(session);
      if (session?.user) {
        void refreshMicFlowSnapshot({ ownerId: session.user.id });
      } else {
        setMicFlowSnapshotLoading(false);
      }
    });
    return () => data.subscription.unsubscribe();
  }, [handleMicFlowAuthTransition, refreshMicFlowSnapshot]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void refreshMicFlowSnapshot();
      }
    });
    return () => subscription.remove();
  }, [refreshMicFlowSnapshot]);

  const submitMicFlowCompletion = useCallback(async (useSave: boolean | null) => {
    const pending = pendingMicFlowCompletionRef.current;
    if (!pending || micFlowDecisionInFlight.current) {
      return;
    }
    micFlowDecisionInFlight.current = true;
    setMicFlowStatus('pending');
    try {
      const result = await recordMicFlowCompletion({ ...pending.input, useSave }, pending.identity);
      if (
        pending.generation !== micFlowIdentityGenerationRef.current ||
        takeIdentityRef.current.clientAttemptId !== pending.input.completionId ||
        micFlowIdentityRef.current?.userId !== pending.identity.userId
      ) {
        return;
      }
      if (result.status === 'save_decision_required') {
        setMicFlowStatus('save_decision_required');
        setMicFlowSavePromptVisible(true);
        setMicFlowCompletionMessage(null);
      } else if (result.status === 'credited' || result.status === 'already_credited' || result.status === 'same_day') {
        setMicFlowStatus('protected');
        setMicFlowSavePromptVisible(false);
        setMicFlowCompletionMessage(result.status === 'credited' ? 'Mic Flow protected.' : 'Today’s Mic Flow is already protected.');
        void refreshMicFlowSnapshot({ force: true, ownerId: pending.identity.userId });
      } else if (result.status === 'unavailable' && (result.reason === 'not_configured' || result.reason === 'unowned' || result.reason === 'stale_identity')) {
        setMicFlowStatus('unprotected');
        setMicFlowSavePromptVisible(false);
        setMicFlowCompletionMessage(null);
      } else if (result.status === 'unavailable' && useSave !== null) {
        setMicFlowStatus('save_decision_required');
        setMicFlowSavePromptVisible(true);
        setMicFlowCompletionMessage(null);
      } else {
        setMicFlowStatus('idle');
        setMicFlowCompletionMessage(null);
      }
    } finally {
      micFlowDecisionInFlight.current = false;
    }
  }, [refreshMicFlowSnapshot]);

  useEffect(() => {
    if (!currentAttempt) {
      return;
    }
    if (micFlowCompletionRef.current === currentAttempt.clientAttemptId) {
      return;
    }
    micFlowCompletionRef.current = currentAttempt.clientAttemptId;
    const identity = micFlowIdentityRef.current;
    if (!identity) {
      setMicFlowStatus('unprotected');
      return;
    }
    const input: MicFlowCompletion = {
      completionId: currentAttempt.clientAttemptId,
      mode: 'cold_take',
      topicId: currentAttempt.topicId,
      selectedDurationSeconds: currentAttempt.selectedDurationSeconds,
      completedDurationSeconds: currentAttempt.completedDurationSeconds,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    };
    const generation = micFlowIdentityGenerationRef.current;
    pendingMicFlowCompletionRef.current = { input, identity, generation };
    void submitMicFlowCompletion(null);
    let cancelled = false;
    void saveUnclaimedAttempt(currentAttempt).then(() => {
      if (!cancelled) {
        setRecoveryAttempt(currentAttempt);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [currentAttempt, submitMicFlowCompletion]);

  const clearCountdown = useCallback(() => {
    if (countdownTimer.current) {
      clearTimeout(countdownTimer.current);
      countdownTimer.current = null;
    }
    setCountdownStartedAtMs(null);
  }, []);

  const stopRecording = useCallback(async () => {
    if (stopInFlight.current || !isRecordingState(recordingState)) {
      return;
    }

    const operationId = ++operationGeneration.current;
    stopInFlight.current = true;
    dispatch({ type: 'STOP_REQUESTED' });
    try {
      const uri = await audio.stop();
      if (operationId !== operationGeneration.current || useRecordingStore.getState().state !== 'processing') {
        return;
      }
      if (uri) {
        dispatch({ type: 'RECORDING_READY', uri });
      } else {
        dispatch({ type: 'FAILURE', message: 'The recording did not produce a local file.' });
      }
    } catch (stopError) {
      dispatch({
        type: 'FAILURE',
        message: stopError instanceof Error ? stopError.message : 'Unable to stop recording.',
      });
    } finally {
      stopInFlight.current = false;
    }
  }, [audio, dispatch, recordingState]);

  const interruptRecording = useCallback(() => {
    if (stopInFlight.current || !isInterruptibleState(recordingState)) {
      return;
    }

    const operationId = ++operationGeneration.current;
    stopInFlight.current = true;
    if (recordingState === 'countdown') {
      clearCountdown();
      dispatch({ type: 'RECORDING_INTERRUPTED', reason: 'The recording was interrupted.' });
      stopInFlight.current = false;
      return;
    }

    void audio
      .stop()
      .catch(() => null)
      .then((uri) => (uri ? audio.deleteRecording(uri).catch(() => undefined) : undefined))
      .finally(() => {
        if (operationId === operationGeneration.current && useRecordingStore.getState().state === 'recording') {
          dispatch({ type: 'RECORDING_INTERRUPTED', reason: 'The recording was interrupted.' });
        }
        stopInFlight.current = false;
      });
  }, [audio, clearCountdown, dispatch, recordingState]);

  useEffect(() => {
    if (recordingState !== 'recording') {
      return;
    }

    const interval = setInterval(() => {
      const nextNowMs = Date.now();
      setNow(nextNowMs);
      if (
        startedAtMs !== null &&
        deriveElapsedMs(startedAtMs, nextNowMs, selectedDurationSeconds * 1000) >=
          selectedDurationSeconds * 1000
      ) {
        void stopRecording();
      }
    }, 100);

    return () => clearInterval(interval);
  }, [recordingState, selectedDurationSeconds, setNow, startedAtMs, stopRecording]);

  useEffect(() => {
    if (audio.mediaServicesDidReset && recordingState === 'recording') {
      const interruptionTimer = setTimeout(() => interruptRecording(), 0);
      return () => clearTimeout(interruptionTimer);
    }
    return undefined;
  }, [audio.mediaServicesDidReset, interruptRecording, recordingState]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active' && isInterruptibleState(recordingState)) {
        interruptRecording();
      }
    });

    return () => subscription.remove();
  }, [interruptRecording, recordingState]);

  useEffect(() => {
    if (displayedPhase !== 'countdown' || countdownStartedAtMs === null) {
      return;
    }

    const interval = setInterval(() => setCountdownNowMs(Date.now()), 100);
    return () => clearInterval(interval);
  }, [countdownStartedAtMs, displayedPhase]);

  useEffect(() => () => clearCountdown(), [clearCountdown]);

  const beginRecording = useCallback(async () => {
    if (startInFlight.current || recordingState === 'recording' || displayedPhase !== 'duration_selection') {
      return;
    }

    const operationId = ++operationGeneration.current;
    startInFlight.current = true;
    setIsStarting(true);
    setActionError(null);
    ++micFlowIdentityGenerationRef.current;
    micFlowIdentityRef.current = null;
    pendingMicFlowCompletionRef.current = null;
    const identity = await establishAnonymousMicFlowSession({
      isCurrent: () => operationId === operationGeneration.current,
    });
    if (operationId === operationGeneration.current && identity) {
      const currentOwnerId = await getMicFlowOwnerId();
      if (operationId === operationGeneration.current && currentOwnerId === identity.userId) {
        micFlowIdentityRef.current = identity;
      }
    }
    dispatch({ type: 'REQUEST_PERMISSION' });

    try {
      const granted = await audio.requestPermission();
      if (operationId !== operationGeneration.current) {
        return;
      }
      dispatch({ type: granted ? 'PERMISSION_GRANTED' : 'PERMISSION_DENIED' });
      if (!granted) {
        setIsStarting(false);
        startInFlight.current = false;
        return;
      }

      dispatch({ type: 'BEGIN_COUNTDOWN' });
      const countdownStart = Date.now();
      setCountdownStartedAtMs(countdownStart);
      setCountdownNowMs(countdownStart);
      await audio.prepare();

      if (operationId !== operationGeneration.current || useRecordingStore.getState().state !== 'countdown') {
        setIsStarting(false);
        startInFlight.current = false;
        return;
      }

      countdownTimer.current = setTimeout(() => {
        countdownTimer.current = null;
        if (operationId !== operationGeneration.current) {
          return;
        }
        void audio
          .start()
          .then(() => {
            if (operationId === operationGeneration.current && useRecordingStore.getState().state === 'countdown') {
              dispatch({ type: 'COUNTDOWN_COMPLETE' });
            } else {
              void audio.stop().catch(() => undefined);
            }
          })
          .catch((startError) => {
            if (operationId === operationGeneration.current && useRecordingStore.getState().state === 'countdown') {
              clearCountdown();
              dispatch({
                type: 'FAILURE',
                message: startError instanceof Error ? startError.message : 'Unable to start recording.',
              });
            }
          });
      }, PREPARATION_COUNTDOWN_MS);
    } catch (startError) {
      if (operationId !== operationGeneration.current) {
        return;
      }
      clearCountdown();
      dispatch({
        type: 'FAILURE',
        message: startError instanceof Error ? startError.message : 'Unable to prepare recording.',
      });
      setActionError(startError instanceof Error ? startError.message : 'Unable to prepare recording.');
    } finally {
      setIsStarting(false);
      startInFlight.current = false;
    }
  }, [audio, clearCountdown, dispatch, displayedPhase, recordingState]);

  const chooseNewTopic = useCallback(() => {
    micFlowIdentityGenerationRef.current += 1;
    micFlowIdentityRef.current = null;
    pendingMicFlowCompletionRef.current = null;
    micFlowCompletionRef.current = null;
    setMicFlowCompletionMessage(null);
    setTopic((currentTopic) => selectNextTopic(currentTopic.id, Date.now() + revealKey + 1));
    setRevealKey((currentKey) => currentKey + 1);
    setTakeTwoBaselineRunId(null);
    setActionError(null);
    setPhase('topic_reveal');
  }, [revealKey]);

  const beginNewTake = useCallback((comparisonBaselineRunId: string | null = null, nextTakeIdentity = createTakeIdentity()) => {
    micFlowIdentityGenerationRef.current += 1;
    micFlowIdentityRef.current = null;
    pendingMicFlowCompletionRef.current = null;
    micFlowCompletionRef.current = null;
    setMicFlowCompletionMessage(null);
    takeIdentityRef.current = nextTakeIdentity;
    setTakeIdentity(nextTakeIdentity);
    setServerAttemptId(null);
    setTakeTwoBaselineRunId(comparisonBaselineRunId);
    setIsQuickReadVisible(false);
    setMicFlowStatus('idle');
    setMicFlowSavePromptVisible(false);
  }, []);

  const beginTakeTwo = useCallback((baselineRunId: string) => {
    if (!baselineRunId || takeTwoStartInFlight.current) {
      return;
    }
    takeTwoStartInFlight.current = true;
    operationGeneration.current += 1;
    const previousRecordingUri = recordingUri;
    const nextTake = createTakeTwoTake({
      baselineRunId,
      duration: selectedDurationSeconds,
      topicId: topic.id,
    });
    beginNewTake(baselineRunId, nextTake.identity);
    dispatch({ type: 'DELETE_RECORDING' });
    setActionError(null);
    setPhase('duration_selection');
    takeTwoStartInFlight.current = false;
    if (previousRecordingUri) {
      void audio.deleteRecording(previousRecordingUri).catch(() => undefined);
    }
  }, [audio, beginNewTake, dispatch, recordingUri, selectedDurationSeconds, topic.id]);

  const retryAttempt = useCallback(async () => {
    try {
      operationGeneration.current += 1;
      if (recordingUri) {
        await audio.deleteRecording(recordingUri);
      }
      await clearUnclaimedAttempt();
      setRecoveryAttempt(null);
      beginNewTake(takeTwoBaselineRunId);
      dispatch({ type: 'RETRY' });
      if (takeTwoBaselineRunId) {
        setPhase('duration_selection');
      } else {
        chooseNewTopic();
      }
    } catch (retryError) {
      setActionError(retryError instanceof Error ? retryError.message : 'Unable to retry recording.');
      dispatch({
        type: 'FAILURE',
        message: retryError instanceof Error ? retryError.message : 'Unable to retry recording.',
      });
    }
  }, [audio, beginNewTake, chooseNewTopic, dispatch, recordingUri, takeTwoBaselineRunId]);

  const deleteAttempt = useCallback(async () => {
    try {
      operationGeneration.current += 1;
      if (recordingUri) {
        await audio.deleteRecording(recordingUri);
      }
      await clearUnclaimedAttempt();
      setRecoveryAttempt(null);
      beginNewTake();
      dispatch({ type: 'DELETE_RECORDING' });
      chooseNewTopic();
    } catch (deleteError) {
      setActionError(deleteError instanceof Error ? deleteError.message : 'Unable to delete recording.');
      dispatch({
        type: 'FAILURE',
        message: deleteError instanceof Error ? deleteError.message : 'Unable to delete recording.',
      });
    }
  }, [audio, beginNewTake, chooseNewTopic, dispatch, recordingUri]);

  const openQuickRead = useCallback(async () => {
    try {
      const requestedTakeId = takeIdentityRef.current.clientAttemptId;
      const session = await getSession();
      if (takeIdentityRef.current.clientAttemptId !== requestedTakeId) {
        return;
      }
      if (!session?.user || session.user.is_anonymous) {
        setIsAuthFlowVisible(true);
        return;
      }
      const attemptId = serverAttemptId ?? (await claimUnclaimedAttempt(currentAttempt));
      if (takeIdentityRef.current.clientAttemptId !== requestedTakeId) {
        return;
      }
      if (typeof attemptId !== 'string') {
        setActionError('Finish account setup before starting a Quick Read.');
        setIsAuthFlowVisible(true);
        return;
      }
      setServerAttemptId(attemptId);
      setIsQuickReadVisible(true);
    } catch (openError) {
      setActionError(openError instanceof Error ? openError.message : 'Sign in before starting a Quick Read.');
      setIsAuthFlowVisible(true);
    }
  }, [currentAttempt, serverAttemptId]);

  if (displayedPhase === 'splash') {
    return <SplashReveal reducedMotion={reducedMotion} />;
  }

  return (
    <>
      <AppShell
        header={
          <AppHeader
            onBack={displayedPhase === 'duration_selection' ? () => setPhase('topic_reveal') : undefined}
          />
        }>
        {(layout) => (
          <>
          {displayedPhase === 'age_gate' && (
            <AgeGate
              onAccept={async () => {
                await saveAgeGateAcceptance();
                setAgeGateAccepted(true);
                setPhase('topic_reveal');
              }}
            />
          )}

          {displayedPhase !== 'age_gate' && (
            <View style={[styles.experienceGrid, layout.useTwoColumns && displayedPhase !== 'topic_reveal' && styles.experienceGridWide]}>
              <View style={styles.primaryColumn} testID="primary-region">
                {recoveryAttempt && displayedPhase !== 'completion' && (
                  <View style={styles.recoveryBanner}>
                    <Text style={styles.recoveryBannerText}>You have a completed local take ready to claim.</Text>
                    <ActionButton label="Resume Quick Read setup" onPress={() => setIsAuthFlowVisible(true)} secondary />
                  </View>
                )}

                {displayedPhase === 'topic_reveal' && (
                  <TopicReveal
                    density={layout.solariDensity}
                    onComplete={() => undefined}
                    onContinue={() => setPhase('duration_selection')}
                    onNewDrop={chooseNewTopic}
                    prompt={topic.prompt}
                    reducedMotion={reducedMotion}
                    revealKey={revealKey}
                    flowCard={(
                      <View style={styles.flowColumnStacked} testID="flow-region">
                        <MicFlowCard loading={micFlowSnapshotLoading} snapshot={micFlowSnapshot} />
                      </View>
                    )}
                  />
                )}

                {displayedPhase === 'duration_selection' && (
                  <DurationSelection
                    actionError={actionError ?? (recordingState === 'permission_denied' ? 'Microphone access is needed for your take.' : recordingError)}
                    isStarting={isStarting}
                    locked={Boolean(takeTwoBaselineRunId)}
                    onBegin={beginRecording}
                    onPermissionRetry={beginRecording}
                    prompt={topic.prompt}
                    selectedDuration={selectedDurationSeconds}
                    setDuration={(duration) => {
                      if (!takeTwoBaselineRunId) {
                        dispatch({ type: 'SELECT_DURATION', duration });
                      }
                    }}
                    stackedDurations={layout.stackControls}
                  />
                )}

                {displayedPhase === 'countdown' && countdownStartedAtMs !== null && (
          <CountdownView
            countdownNumber={formatCountdownNumber(countdownStartedAtMs, countdownNowMs)}
            onCancel={() => {
              clearCountdown();
              dispatch({ type: 'CANCEL' });
              setPhase('duration_selection');
            }}
            prompt={topic.prompt}
            reducedMotion={reducedMotion}
          />
                )}

                {displayedPhase === 'recording' && (
          <RecordingView
            elapsed={elapsed}
            onStop={() => void stopRecording()}
            prompt={topic.prompt}
            selectedDuration={selectedDurationSeconds}
          />
                )}

                {displayedPhase === 'interrupted' && (
          <StatusPanel
            actionLabel="Try this prompt again"
            body="The take stopped safely. Nothing left this device."
            onAction={() => void retryAttempt()}
            prompt={topic.prompt}
            title="A pause, not a problem."
          />
                )}

                {displayedPhase === 'error' && (
          <StatusPanel
            actionLabel="Try again"
            body={actionError ?? recordingError ?? 'The take failed safely. Your local state is still intact.'}
            onAction={() => void retryAttempt()}
            prompt={topic.prompt}
            title="Let’s reset the take."
          />
                )}

                {displayedPhase === 'completion' && recordingUri && (
          <CompletionView
            completedAtMs={completedAtMs}
            elapsed={elapsedMs}
            micFlowCompletionMessage={micFlowCompletionMessage}
            micFlowSavePromptVisible={micFlowSavePromptVisible}
            micFlowStatus={micFlowStatus}
            onMicFlowSaveDecision={(useSave) => void submitMicFlowCompletion(useSave)}
            onDelete={() => void deleteAttempt()}
            onPlay={() =>
              void audio.play(recordingUri).catch((playError) => {
                setActionError(playError instanceof Error ? playError.message : 'Unable to play recording.');
                dispatch({ type: 'FAILURE', message: playError instanceof Error ? playError.message : 'Unable to play recording.' });
              })
            }
            onQuickRead={() => void openQuickRead()}
            onRetry={() => void retryAttempt()}
            prompt={topic.prompt}
            recordingUri={recordingUri}
            reducedMotion={reducedMotion}
            selectedDuration={selectedDurationSeconds}
          />
                )}
              </View>

              {displayedPhase !== 'topic_reveal' && displayedPhase !== 'recording' && displayedPhase !== 'countdown' && (
                <View
                  style={[styles.flowColumn, !layout.useTwoColumns && styles.flowColumnStacked]}
                  testID="flow-region">
                  <MicFlowCard loading={micFlowSnapshotLoading} snapshot={micFlowSnapshot} />
                </View>
              )}
            </View>
          )}
          </>
        )}
      </AppShell>
      <SignupFlow
        attempt={currentAttempt ?? recoveryAttempt}
        onAttemptClaimed={setServerAttemptId}
        onClose={() => {
          setIsAuthFlowVisible(false);
          void refreshRecoveryAttempt();
        }}
        onSignedOut={() => {
          handleMicFlowAuthTransition(null);
          setMicFlowSnapshotLoading(false);
          setMicFlowSavePromptVisible(false);
          setMicFlowStatus('unprotected');
          setActionError('Signed out. Your local recording remains on this device.');
        }}
        visible={isAuthFlowVisible}
      />
      <QuickReadFlow
        key={takeIdentity.clientAttemptId}
        attemptId={serverAttemptId}
        audioExtension={quickReadAudioExtension(recordingUri)}
        audioUri={recordingUri}
        idempotencyKey={takeIdentity.quickReadIdempotencyKey}
        onClose={() => {
          setIsQuickReadVisible(false);
          if (takeTwoBaselineRunId) {
            setTakeTwoBaselineRunId(null);
          }
        }}
        onTakeTwo={beginTakeTwo}
        prompt={topic.prompt}
        takeTwoBaselineRunId={takeTwoBaselineRunId}
        takeId={takeIdentity.clientAttemptId}
        visible={isQuickReadVisible}
      />
    </>
  );
}

function TopicReveal({
  density,
  flowCard,
  onComplete,
  onContinue,
  onNewDrop,
  prompt,
  reducedMotion,
  revealKey,
}: {
  density: 'compact-landscape' | 'phone' | 'tablet';
  flowCard: ReactNode;
  onComplete: () => void;
  onContinue: () => void;
  onNewDrop: () => void;
  prompt: string;
  reducedMotion: boolean;
  revealKey: number;
}) {
  return (
    <View style={styles.section} testID="topic-reveal">
      <Text accessibilityRole="header" maxFontSizeMultiplier={1.5} style={styles.heroTitle}>Today’s Drop</Text>
      <ActionButton
        accessibilityHint="Shows a different local prompt"
        label="New Drop!"
        onPress={onNewDrop}
        secondary
      />
      <SolariBoard
        density={density}
        onComplete={onComplete}
        prompt={prompt}
        reducedMotion={reducedMotion}
        revealKey={revealKey}
      />
      {flowCard}
      <ActionButton
        accessibilityHint="Opens recording preparation for this prompt"
        label="Let’s Go!"
        onPress={onContinue}
        testID="prompt-continue"
      />
    </View>
  );
}

function DurationSelection({
  actionError,
  isStarting,
  locked,
  onBegin,
  onPermissionRetry,
  prompt,
  selectedDuration,
  setDuration,
  stackedDurations,
}: {
  actionError: string | null;
  isStarting: boolean;
  locked: boolean;
  onBegin: () => void;
  onPermissionRetry: () => void;
  prompt: string;
  selectedDuration: RecordingDuration;
  setDuration: (duration: RecordingDuration) => void;
  stackedDurations: boolean;
}) {
  return (
    <View style={styles.section} testID="duration-selection">
      <Text accessibilityRole="header" style={styles.sectionTitle}>Today’s Drop</Text>
      <PromptCard prompt={prompt} />
      {locked && <Text style={styles.lockedTakeNote}>TAKE TWO · SAME PROMPT AND CLOCK</Text>}
      <DurationPicker disabled={locked} onChange={setDuration} selected={selectedDuration} stacked={stackedDurations} />
      {actionError && (
        <View style={styles.inlineNotice}>
          <Text style={styles.inlineNoticeText}>{actionError}</Text>
          <ActionButton label="Try microphone permission again" onPress={onPermissionRetry} secondary />
        </View>
      )}
      <ActionButton
        accessibilityHint="Starts microphone preparation and the countdown"
        disabled={isStarting}
        label={isStarting ? 'Preparing your Drop…' : 'Let’s Go!'}
        onPress={onBegin}
      />
    </View>
  );
}

function CountdownView({
  countdownNumber,
  onCancel,
  prompt,
  reducedMotion,
}: {
  countdownNumber: number;
  onCancel: () => void;
  prompt: string;
  reducedMotion: boolean;
}) {
  return (
    <View style={styles.centerSection}>
      <Text style={styles.eyebrow}>GET SET</Text>
      <Animated.Text accessibilityLiveRegion="polite" style={[styles.countdownNumber, reducedMotion && styles.countdownNumberStatic]}>
        {countdownNumber}
      </Animated.Text>
      <Text accessibilityRole="header" style={styles.sectionTitle}>Find your first sentence.</Text>
      <Text style={styles.centerPrompt}>{prompt}</Text>
      <ActionButton label="Cancel countdown" onPress={onCancel} secondary />
    </View>
  );
}

function RecordingView({
  elapsed,
  onStop,
  prompt,
  selectedDuration,
}: {
  elapsed: number;
  onStop: () => void;
  prompt: string;
  selectedDuration: RecordingDuration;
}) {
  return (
    <View style={styles.centerSection}>
      <View style={styles.liveDot} />
      <Text style={styles.eyebrow}>YOU’RE LIVE / LOCAL ONLY</Text>
      <Text accessibilityLiveRegion="polite" style={styles.timer}>{formatSpeakingTime(elapsed)}</Text>
      <Text style={styles.timerTarget}>OF {formatSpeakingTime(selectedDuration * 1000)}</Text>
      <PromptCard prompt={prompt} />
      <ActionButton label="Stop recording" onPress={onStop} />
    </View>
  );
}

function CompletionView({
  completedAtMs,
  elapsed,
  micFlowCompletionMessage,
  micFlowSavePromptVisible,
  micFlowStatus,
  onMicFlowSaveDecision,
  onDelete,
  onPlay,
  onQuickRead,
  onRetry,
  prompt,
  recordingUri,
  reducedMotion,
  selectedDuration,
}: {
  completedAtMs: number | null;
  elapsed: number;
  micFlowCompletionMessage: string | null;
  micFlowSavePromptVisible: boolean;
  micFlowStatus: 'idle' | 'pending' | 'protected' | 'unprotected' | 'save_decision_required';
  onMicFlowSaveDecision: (useSave: boolean) => void;
  onDelete: () => void;
  onPlay: () => void;
  onQuickRead: () => void;
  onRetry: () => void;
  prompt: string;
  recordingUri: string;
  reducedMotion: boolean;
  selectedDuration: RecordingDuration;
}) {
  return (
    <>
      <View style={styles.section}>
        <CompletionMark reducedMotion={reducedMotion} />
        <Text accessibilityRole="header" style={styles.heroTitle}>That’s a take.</Text>
        <Text style={styles.completionMeta}>{formatSpeakingTime(elapsed)} captured · {selectedDuration}s setting</Text>
        <Text accessibilityElementsHidden style={styles.completionMeta}>Completed at {completedAtMs ?? 'local time'}</Text>
        {micFlowStatus === 'pending' && !micFlowSavePromptVisible && <Text accessibilityLiveRegion="polite" style={styles.completionMeta}>Protecting your Mic Flow…</Text>}
        {micFlowCompletionMessage && <Text accessibilityLiveRegion="polite" style={styles.completionMeta}>{micFlowCompletionMessage}</Text>}
        {micFlowStatus === 'unprotected' && <Text accessibilityLiveRegion="polite" style={styles.errorText}>Connect to protect your Mic Flow.</Text>}
        <Text accessibilityElementsHidden style={styles.recordingMetadata} testID="recording-uri">{recordingUri}</Text>
        <PromptCard prompt={prompt} />
        <View style={styles.actionStack}>
          <ActionButton label="Play recording" onPress={onPlay} />
          <ActionButton label="Get a Quick Read" onPress={onQuickRead} secondary />
          <View style={styles.secondaryRow}>
            <ActionButton compact label="Retry recording" onPress={onRetry} secondary />
            <ActionButton compact label="Delete recording" onPress={onDelete} secondary />
          </View>
        </View>
      </View>
      <MicFlowSavePrompt
        disabled={micFlowStatus === 'pending'}
        onDecision={onMicFlowSaveDecision}
        visible={micFlowSavePromptVisible}
      />
    </>
  );
}

function MicFlowSavePrompt({
  disabled,
  onDecision,
  visible,
}: {
  disabled: boolean;
  onDecision: (useSave: boolean) => void;
  visible: boolean;
}) {
  return (
    <Modal accessibilityViewIsModal animationType="slide" onRequestClose={() => undefined} transparent visible={visible}>
      <View style={styles.savePromptBackdrop}>
        <View accessibilityLabel="Mic Save decision" style={styles.savePromptSheet}>
          <Text style={styles.eyebrow}>MIC SAVE</Text>
          <Text accessibilityRole="header" style={styles.savePromptTitle}>You missed yesterday.</Text>
          <Text style={styles.savePromptBody}>Use a Mic Save to protect your Flow?</Text>
          <ActionButton disabled={disabled} label={disabled ? 'Protecting your Flow…' : 'Use Mic Save'} onPress={() => onDecision(true)} />
          <ActionButton disabled={disabled} label="Continue without Save" onPress={() => onDecision(false)} secondary />
        </View>
      </View>
    </Modal>
  );
}

function CompletionMark({ reducedMotion }: { reducedMotion: boolean }) {
  const [scale] = useState(() => new Animated.Value(0.65));

  useEffect(() => {
    if (reducedMotion) {
      scale.setValue(1);
      return;
    }
    Animated.spring(scale, { friction: 7, tension: 70, toValue: 1, useNativeDriver: true }).start();
  }, [reducedMotion, scale]);

  return (
    <Animated.View style={[styles.completionMark, { transform: [{ scale }] }]}>
      <Text style={styles.completionMarkText}>✓</Text>
    </Animated.View>
  );
}

function StatusPanel({
  actionLabel,
  body,
  onAction,
  prompt,
  title,
}: {
  actionLabel: string;
  body: string;
  onAction: () => void;
  prompt: string;
  title: string;
}) {
  return (
    <View style={styles.centerSection}>
      <Text style={styles.eyebrow}>LOCAL RECOVERY</Text>
      <Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.centerPrompt}>{prompt}</Text>
      <Text style={styles.errorText}>{body}</Text>
      <ActionButton label={actionLabel} onPress={onAction} />
    </View>
  );
}

function quickReadAudioExtension(uri: string | null): 'm4a' | 'mp4' | 'webm' | 'wav' | 'ogg' {
  const extension = uri?.split('?')[0].split('.').pop()?.toLowerCase();
  if (extension === 'm4a' || extension === 'mp4' || extension === 'webm' || extension === 'wav' || extension === 'ogg') {
    return extension;
  }
  return detectWebRecordingMimeType()?.includes('mp4') ? 'mp4' : 'webm';
}

const styles = StyleSheet.create({
  experienceGrid: { gap: spacing.xxl },
  experienceGridWide: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.xxxl },
  primaryColumn: { flex: 1, gap: spacing.xxl, minWidth: 0 },
  flowColumn: { flexShrink: 0, width: 340 },
  flowColumnStacked: { width: '100%' },
  section: { gap: spacing.xl },
  centerSection: { alignItems: 'center', gap: spacing.xl, justifyContent: 'center', paddingVertical: spacing.xxxl },
  eyebrow: { color: colors.coral, ...typography.eyebrow },
  heroTitle: { color: colors.inkStrong, fontFamily: typography.displayFamily, letterSpacing: -1, ...typography.displayLarge },
  sectionTitle: { color: colors.inkStrong, fontFamily: typography.displayFamily, ...typography.displayMedium },
  lockedTakeNote: { color: colors.coral, ...typography.eyebrow },
  inlineNotice: { backgroundColor: colors.dangerSoft, borderRadius: radii.md, gap: spacing.md, padding: spacing.lg },
  inlineNoticeText: { color: colors.danger, fontSize: 14, lineHeight: 21 },
  countdownNumber: { color: colors.coral, fontFamily: typography.displayFamily, fontSize: 138, fontWeight: '700', lineHeight: 150 },
  countdownNumberStatic: { opacity: 0.9 },
  centerPrompt: { color: colors.muted, fontFamily: typography.displayFamily, fontSize: 21, lineHeight: 29, maxWidth: 560, textAlign: 'center' },
  liveDot: { backgroundColor: colors.coral, borderRadius: radii.pill, height: 16, width: 16 },
  timer: { color: colors.inkStrong, fontFamily: typography.displayFamily, fontSize: 78, fontWeight: '700', letterSpacing: -3 },
  timerTarget: { color: colors.muted, fontSize: 12, fontWeight: '900', letterSpacing: 2 },
  completionMark: { alignItems: 'center', backgroundColor: colors.ink, borderRadius: radii.pill, height: 82, justifyContent: 'center', width: 82 },
  completionMarkText: { color: colors.successSoft, fontSize: 48, fontWeight: '300' },
  completionMeta: { color: colors.muted, fontSize: 13 },
  actionStack: { gap: spacing.md },
  secondaryRow: { flexDirection: 'row', gap: spacing.md },
  errorText: { color: colors.danger, fontSize: 15, lineHeight: 23, textAlign: 'center' },
  recordingMetadata: { height: 0, opacity: 0, width: 0 },
  recoveryBanner: { backgroundColor: colors.surfaceMuted, borderRadius: radii.md, gap: spacing.md, padding: spacing.lg },
  recoveryBannerText: { color: colors.ink, fontSize: 14, lineHeight: 20 },
  savePromptBackdrop: { backgroundColor: 'rgba(8, 31, 51, 0.58)', flex: 1, justifyContent: 'flex-end' },
  savePromptSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: spacing.lg, padding: spacing.xxl, paddingBottom: spacing.jumbo },
  savePromptTitle: { color: colors.inkStrong, fontFamily: typography.displayFamily, ...typography.displayMedium },
  savePromptBody: { color: colors.muted, fontSize: 17, lineHeight: 25 },
});
