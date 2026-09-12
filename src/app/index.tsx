import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { SignupFlow } from '@/features/auth/SignupFlow';
import { clearUnclaimedAttempt, getUnclaimedAttempt, saveAndVerifyUnclaimedAttempt, type UnclaimedAttempt } from '@/features/auth/auth-recovery';
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
import {
  firstScreenAfterSplash,
  PREPARATION_COUNTDOWN_MS,
  SPLASH_DURATION_MS,
  formatCountdownNumber,
  formatSpeakingTime,
  phaseForRecordingState,
  recoveryPresentationForState,
  recordingStartDecision,
  type FirstUsePhase,
} from '@/features/first-use/first-use-flow';
import { hasAcceptedAgeGate, saveAgeGateAcceptance } from '@/features/first-use/first-run-storage';
import { SplashReveal } from '@/features/first-use/SplashReveal';
import { useReducedMotion } from '@/features/first-use/use-reduced-motion';
import { QuickReadFlow } from '@/features/quick-read/QuickReadFlow';
import { createTakeIdentity, type TakeIdentity } from '@/features/quick-read/attempt-identity';
import { createTakeTwoTake } from '@/features/quick-read/take-two-journey';
import { useLocalAudioRecorder } from '@/features/recording/use-local-audio-recorder';
import { HoldToCancel } from '@/features/recording/HoldToCancel';
import {
  clearLocalCompletedTake,
  getLocalCompletedTake,
  LOCAL_COMPLETED_TAKE_VERSION,
  saveAndVerifyLocalCompletedTake,
  type LocalCompletedTake,
} from '@/features/recording/local-completed-take';
import {
  deriveActiveElapsedMs,
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
  const recordingFailureKind = useRecordingStore((store) => store.failureKind);
  const cleanupPending = useRecordingStore((store) => store.cleanupPending);
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
  const [retainedCompletedTake, setRetainedCompletedTake] = useState<LocalCompletedTake | null>(null);
  const [completedTakeHidden, setCompletedTakeHidden] = useState(false);
  const [retainedTakeStartPromptVisible, setRetainedTakeStartPromptVisible] = useState(false);
  const [retainedTakeHydrating, setRetainedTakeHydrating] = useState(true);
  const stopInFlight = useRef(false);
  const completionInFlight = useRef(false);
  const cleanupInFlight = useRef(false);
  const startInFlight = useRef(false);
  const operationGeneration = useRef(0);
  const countdownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const takeIdentityRef = useRef(takeIdentity);
  const takeTwoStartInFlight = useRef(false);
  const micFlowCompletionRef = useRef<string | null>(null);
  const micFlowIdentityRef = useRef<MicFlowRecordingIdentity | null>(null);
  const recordingOwnerIdRef = useRef<string | null>(null);
  const micFlowIdentityGenerationRef = useRef(0);
  const pendingMicFlowCompletionRef = useRef<{ input: MicFlowCompletion; identity: MicFlowRecordingIdentity; generation: number } | null>(null);
  const micFlowDecisionInFlight = useRef(false);
  const micFlowSnapshotRequestRef = useRef(0);
  const micFlowSnapshotCoordinatorRef = useRef(createMicFlowSnapshotCoordinator());
  const discardTransientRecordingRef = useRef(audio.discardTransientRecording);

  const elapsed = useMemo(
    () => deriveActiveElapsedMs(elapsedMs, startedAtMs, nowMs, selectedDurationSeconds * 1000),
    [elapsedMs, nowMs, selectedDurationSeconds, startedAtMs],
  );
  const remainingMs = Math.max(0, selectedDurationSeconds * 1000 - elapsed);
  const statePhase = phaseForRecordingState(recordingState);
  const hasHiddenCompletedTake = recordingState === 'completed' && completedTakeHidden && Boolean(recordingUri);
  const recoveryPresentation = recoveryPresentationForState({
    hasAuthRecovery: Boolean(recoveryAttempt),
    hasHiddenCompletedTake,
    hasRetainedCompletedTake: Boolean(retainedCompletedTake),
  });
  const firstUsePhase = phase === 'splash' && splashElapsed && ageGateAccepted !== null
    ? firstScreenAfterSplash(ageGateAccepted)
    : phase;
  const displayedPhase: ExperiencePhase =
    (statePhase === 'completion' && completedTakeHidden ? firstUsePhase : statePhase) ??
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
    if (recordingOwnerIdRef.current && recordingOwnerIdRef.current !== nextOwnerId) {
      recordingOwnerIdRef.current = null;
    }
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
    let cancelled = false;
    void getMicFlowOwnerId().then(async (ownerId) => {
      const restored = await getLocalCompletedTake(ownerId);
      if (!cancelled) {
        setRetainedCompletedTake(restored);
        setRetainedTakeHydrating(false);
      }
    }).catch(() => {
      if (!cancelled) {
        setRetainedCompletedTake(null);
        setRetainedTakeHydrating(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return bindRevenueCatSession();
  }, []);

  useEffect(() => {
    discardTransientRecordingRef.current = audio.discardTransientRecording;
  }, [audio.discardTransientRecording]);

  useEffect(() => {
    const refreshTimer = setTimeout(() => void refreshMicFlowSnapshot(), 0);
    return () => clearTimeout(refreshTimer);
  }, [refreshMicFlowSnapshot]);

  useEffect(() => {
    return () => {
      micFlowIdentityGenerationRef.current += 1;
      micFlowIdentityRef.current = null;
      recordingOwnerIdRef.current = null;
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
    } catch {
      setMicFlowStatus('unprotected');
      setMicFlowSavePromptVisible(false);
      setMicFlowCompletionMessage(null);
    } finally {
      micFlowDecisionInFlight.current = false;
    }
  }, [refreshMicFlowSnapshot]);

  const exposeVerifiedCompletion = useCallback((attempt: UnclaimedAttempt) => {
    if (micFlowCompletionRef.current === attempt.clientAttemptId) {
      return;
    }
    micFlowCompletionRef.current = attempt.clientAttemptId;
    const identity = micFlowIdentityRef.current;
    if (!identity) {
      setMicFlowStatus('unprotected');
      return;
    }
    const input: MicFlowCompletion = {
      completionId: attempt.clientAttemptId,
      mode: 'cold_take',
      topicId: attempt.topicId,
      selectedDurationSeconds: attempt.selectedDurationSeconds,
      completedDurationSeconds: attempt.completedDurationSeconds,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    };
    const generation = micFlowIdentityGenerationRef.current;
    pendingMicFlowCompletionRef.current = { input, identity, generation };
    void submitMicFlowCompletion(null);
  }, [submitMicFlowCompletion]);

  const persistFinalizedAttempt = useCallback(async (completedAtMsForAttempt: number, activeElapsedMs: number) => {
    const attempt: UnclaimedAttempt = {
      audioRetained: false,
      clientAttemptId: takeIdentityRef.current.clientAttemptId,
      completedAt: new Date(completedAtMsForAttempt).toISOString(),
      completedDurationSeconds: Math.round(activeElapsedMs / 1000),
      selectedDurationSeconds,
      topicId: topic.id,
    };
    const savedAttempt = await saveAndVerifyUnclaimedAttempt(attempt);
    setRecoveryAttempt(savedAttempt);
    return savedAttempt;
  }, [selectedDurationSeconds, topic.id]);

  const persistLocalCompletedTake = useCallback(async (
    uri: string,
    completedAtMsForAttempt: number,
    activeElapsedMs: number,
  ) => {
    const ownerId = recordingOwnerIdRef.current ?? micFlowIdentityRef.current?.userId ?? await getMicFlowOwnerId();
    if (!ownerId) {
      setRetainedCompletedTake(null);
      throw new Error('A local owner is required before this recording can be saved.');
    }
    const retainedTake: LocalCompletedTake = {
      version: LOCAL_COMPLETED_TAKE_VERSION,
      clientAttemptId: takeIdentityRef.current.clientAttemptId,
      completedAt: new Date(completedAtMsForAttempt).toISOString(),
      completedDurationSeconds: Math.round(activeElapsedMs / 1000),
      localUri: uri,
      ownerId,
      prompt: topic.prompt,
      quickReadIdempotencyKey: takeIdentityRef.current.quickReadIdempotencyKey,
      selectedDurationSeconds,
      topicId: topic.id,
    };
    const verifiedTake = await saveAndVerifyLocalCompletedTake(retainedTake);
    setRetainedCompletedTake(verifiedTake);
    return verifiedTake;
  }, [selectedDurationSeconds, topic.id, topic.prompt]);

  const beginNewTake = useCallback((comparisonBaselineRunId: string | null = null, nextTakeIdentity = createTakeIdentity()) => {
    micFlowIdentityGenerationRef.current += 1;
    micFlowIdentityRef.current = null;
    pendingMicFlowCompletionRef.current = null;
    micFlowCompletionRef.current = null;
    recordingOwnerIdRef.current = null;
    setMicFlowCompletionMessage(null);
    takeIdentityRef.current = nextTakeIdentity;
    setTakeIdentity(nextTakeIdentity);
    setServerAttemptId(null);
    setTakeTwoBaselineRunId(comparisonBaselineRunId);
    setIsQuickReadVisible(false);
    setMicFlowStatus('idle');
    setMicFlowSavePromptVisible(false);
    setRetainedTakeStartPromptVisible(false);
  }, []);

  const showRetainedCompletedTake = useCallback((take: LocalCompletedTake) => {
    setTopic({ category: 'Recovered', id: take.topicId, prompt: take.prompt });
    const restoredIdentity = {
      clientAttemptId: take.clientAttemptId,
      quickReadIdempotencyKey: take.quickReadIdempotencyKey,
    };
    takeIdentityRef.current = restoredIdentity;
    setTakeIdentity(restoredIdentity);
    setServerAttemptId(null);
    setTakeTwoBaselineRunId(null);
    setIsQuickReadVisible(false);
    setRetainedTakeStartPromptVisible(false);
    micFlowCompletionRef.current = take.clientAttemptId;
    recordingOwnerIdRef.current = take.ownerId;
    audio.retainFinalizedRecording(take.localUri);
    dispatch({
      type: 'RESTORE_COMPLETED',
      completedAtMs: Date.parse(take.completedAt),
      elapsedMs: take.completedDurationSeconds * 1000,
      selectedDurationSeconds: take.selectedDurationSeconds,
      uri: take.localUri,
    });
    setCompletedTakeHidden(false);
  }, [audio, dispatch]);

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

    stopInFlight.current = true;
    dispatch({ type: 'STOP_REQUESTED' });
    try {
      await audio.pause();
    } catch (pauseError) {
      dispatch({
        type: 'FAILURE',
        message: pauseError instanceof Error ? pauseError.message : 'Unable to pause recording.',
      });
    } finally {
      stopInFlight.current = false;
    }
  }, [audio, dispatch, recordingState]);

  const resumeRecording = useCallback(async () => {
    if (stopInFlight.current || recordingState !== 'paused') {
      return;
    }
    stopInFlight.current = true;
    dispatch({ type: 'RESUME_REQUESTED' });
    try {
      await audio.resume();
    } catch (resumeError) {
      dispatch({
        type: 'FAILURE',
        message: resumeError instanceof Error ? resumeError.message : 'Unable to resume recording.',
      });
    } finally {
      stopInFlight.current = false;
    }
  }, [audio, dispatch, recordingState]);

  const completeRecording = useCallback(async () => {
    const currentState = useRecordingStore.getState();
    if (
      completionInFlight.current ||
      (currentState.state !== 'recording' && currentState.state !== 'paused' && currentState.state !== 'completing')
    ) {
      return;
    }

    const operationId = ++operationGeneration.current;
    completionInFlight.current = true;
    if (currentState.state !== 'completing') {
      dispatch({ type: 'COMPLETE_REQUESTED' });
    }
    try {
      const activeElapsedMs = useRecordingStore.getState().elapsedMs;
      const uri = useRecordingStore.getState().recordingUri ?? await audio.finalize();
      if (operationId !== operationGeneration.current || useRecordingStore.getState().state !== 'completing') {
        return;
      }
      if (uri) {
        dispatch({ type: 'FINALIZED', uri });
        const completedAtMsForAttempt = Date.now();
        await persistLocalCompletedTake(uri, completedAtMsForAttempt, activeElapsedMs);
        const savedAttempt = await persistFinalizedAttempt(completedAtMsForAttempt, activeElapsedMs);
        if (operationId !== operationGeneration.current || useRecordingStore.getState().state !== 'completing') {
          return;
        }
        audio.retainFinalizedRecording(uri);
        setCompletedTakeHidden(false);
        dispatch({ type: 'PERSISTENCE_CONFIRMED', completedAtMs: completedAtMsForAttempt });
        exposeVerifiedCompletion(savedAttempt);
      } else {
        dispatch({ type: 'FAILURE', message: 'The recording did not produce a local file.' });
      }
    } catch (completionError) {
      const message = completionError instanceof Error ? completionError.message : 'Unable to complete recording.';
      if (useRecordingStore.getState().recordingUri) {
        dispatch({ type: 'PERSISTENCE_FAILED', message });
      } else {
        dispatch({ type: 'FAILURE', message });
      }
    } finally {
      completionInFlight.current = false;
    }
  }, [audio, dispatch, exposeVerifiedCompletion, persistFinalizedAttempt, persistLocalCompletedTake]);

  const cancelActiveRecording = useCallback(async () => {
    const currentState = useRecordingStore.getState();
    if (cleanupInFlight.current || (currentState.state !== 'paused' && currentState.state !== 'cancelling')) {
      return;
    }

    const operationId = ++operationGeneration.current;
    cleanupInFlight.current = true;
    dispatch({ type: 'CANCEL_CONFIRMED' });
    try {
      await audio.discardTransientRecording();
      if (operationId !== operationGeneration.current || useRecordingStore.getState().state !== 'cancelling') {
        return;
      }
      dispatch({ type: 'CLEANUP_SUCCEEDED' });
      beginNewTake(takeTwoBaselineRunId);
      setPhase('duration_selection');
      setActionError(null);
    } catch (cleanupError) {
      dispatch({
        type: 'CLEANUP_FAILED',
        message: cleanupError instanceof Error ? cleanupError.message : 'Unable to delete the temporary recording.',
      });
    } finally {
      cleanupInFlight.current = false;
    }
  }, [audio, beginNewTake, dispatch, takeTwoBaselineRunId]);

  const deleteRetainedCompletedTake = useCallback(async (uri: string | null = recordingUri) => {
    if (uri) {
      await audio.deleteRecording(uri);
    } else if (retainedCompletedTake?.localUri) {
      await audio.deleteRecording(retainedCompletedTake.localUri);
    }
    await clearLocalCompletedTake();
    await clearUnclaimedAttempt();
    setRecoveryAttempt(null);
    setRetainedCompletedTake(null);
    setCompletedTakeHidden(false);
    setRetainedTakeStartPromptVisible(false);
  }, [audio, recordingUri, retainedCompletedTake]);

  const closeCompletedTake = useCallback(async () => {
    try {
      await audio.stopPlayback();
      setCompletedTakeHidden(true);
      setPhase('topic_reveal');
      setActionError(null);
    } catch (playbackCleanupError) {
      setActionError(
        playbackCleanupError instanceof Error
          ? playbackCleanupError.message
          : 'Unable to stop saved take playback. Your saved take is still available.',
      );
    }
  }, [audio]);

  const retrySaveFinalizedAttempt = useCallback(async () => {
    const state = useRecordingStore.getState();
    if (completionInFlight.current || state.failureKind !== 'persistence' || !state.recordingUri) {
      return;
    }
    const operationId = ++operationGeneration.current;
    completionInFlight.current = true;
    dispatch({ type: 'RETRY_SAVE' });
    try {
      const completedAtMsForAttempt = Date.now();
      await persistLocalCompletedTake(state.recordingUri, completedAtMsForAttempt, state.elapsedMs);
      const savedAttempt = await persistFinalizedAttempt(completedAtMsForAttempt, state.elapsedMs);
      if (operationId !== operationGeneration.current || useRecordingStore.getState().state !== 'completing') {
        return;
      }
      audio.retainFinalizedRecording(state.recordingUri);
      setCompletedTakeHidden(false);
      dispatch({ type: 'PERSISTENCE_CONFIRMED', completedAtMs: completedAtMsForAttempt });
      exposeVerifiedCompletion(savedAttempt);
      setActionError(null);
    } catch (saveError) {
      dispatch({
        type: 'PERSISTENCE_FAILED',
        message: saveError instanceof Error ? saveError.message : 'Unable to save the completed recording.',
      });
    } finally {
      completionInFlight.current = false;
    }
  }, [audio, dispatch, exposeVerifiedCompletion, persistFinalizedAttempt, persistLocalCompletedTake]);

  const retryCleanupRecording = useCallback(async () => {
    const state = useRecordingStore.getState();
    if (cleanupInFlight.current || state.failureKind !== 'cleanup') {
      return;
    }
    const operationId = ++operationGeneration.current;
    cleanupInFlight.current = true;
    dispatch({ type: 'RETRY_CLEANUP' });
    try {
      await audio.discardTransientRecording();
      if (operationId !== operationGeneration.current || useRecordingStore.getState().state !== 'cancelling') {
        return;
      }
      dispatch({ type: 'CLEANUP_SUCCEEDED' });
      beginNewTake(takeTwoBaselineRunId);
      setPhase('duration_selection');
      setActionError(null);
    } catch (cleanupError) {
      dispatch({
        type: 'CLEANUP_FAILED',
        message: cleanupError instanceof Error ? cleanupError.message : 'Unable to delete the temporary recording.',
      });
    } finally {
      cleanupInFlight.current = false;
    }
  }, [audio, beginNewTake, dispatch, takeTwoBaselineRunId]);

  const interruptRecording = useCallback((reason = 'The recording was interrupted.') => {
    if (cleanupInFlight.current || !isInterruptibleState(useRecordingStore.getState().state)) {
      return;
    }

    const operationId = ++operationGeneration.current;
    cleanupInFlight.current = true;
    const currentState = useRecordingStore.getState().state;
    if (currentState === 'countdown') {
      clearCountdown();
      dispatch({ type: 'RECORDING_INTERRUPTED', reason });
      void audio.discardTransientRecording()
        .then(() => {
          if (operationId === operationGeneration.current && useRecordingStore.getState().state === 'interrupted') {
            dispatch({ type: 'CLEANUP_SUCCEEDED' });
          }
        })
        .catch((cleanupError) => {
          dispatch({
            type: 'CLEANUP_FAILED',
            message: cleanupError instanceof Error ? cleanupError.message : 'Unable to delete the interrupted recording.',
          });
        })
        .finally(() => {
          cleanupInFlight.current = false;
        });
      return;
    }

    dispatch({ type: 'RECORDING_INTERRUPTED', reason });
    void audio
      .discardTransientRecording()
      .then(() => {
        if (operationId === operationGeneration.current && useRecordingStore.getState().state === 'interrupted') {
          dispatch({ type: 'CLEANUP_SUCCEEDED' });
        }
      })
      .catch((cleanupError) => {
        dispatch({
          type: 'CLEANUP_FAILED',
          message: cleanupError instanceof Error ? cleanupError.message : 'Unable to delete the interrupted recording.',
        });
      })
      .finally(() => {
        cleanupInFlight.current = false;
      });
  }, [audio, clearCountdown, dispatch]);

  useEffect(() => {
    if (recordingState !== 'recording') {
      return;
    }

    const interval = setInterval(() => {
      const nextNowMs = Date.now();
      setNow(nextNowMs);
      if (
        startedAtMs !== null &&
        deriveActiveElapsedMs(elapsedMs, startedAtMs, nextNowMs, selectedDurationSeconds * 1000) >=
          selectedDurationSeconds * 1000
      ) {
        void completeRecording();
      }
    }, 100);

    return () => clearInterval(interval);
  }, [completeRecording, elapsedMs, recordingState, selectedDurationSeconds, setNow, startedAtMs]);

  useEffect(() => {
    if (audio.mediaServicesDidReset && isInterruptibleState(recordingState)) {
      const interruptionTimer = setTimeout(() => interruptRecording(), 0);
      return () => clearTimeout(interruptionTimer);
    }
    return undefined;
  }, [audio.mediaServicesDidReset, interruptRecording, recordingState]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active' && isInterruptibleState(recordingState)) {
        interruptRecording('The app left the foreground before the Drop finished.');
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

  useEffect(() => () => {
    operationGeneration.current += 1;
    if (countdownTimer.current) {
      clearTimeout(countdownTimer.current);
      countdownTimer.current = null;
    }
    if (isInterruptibleState(useRecordingStore.getState().state)) {
      void discardTransientRecordingRef.current().catch(() => undefined);
      useRecordingStore.getState().dispatch({ type: 'RECORDING_INTERRUPTED', reason: 'The recording screen closed before the Drop finished.' });
    }
  }, []);

  const beginRecording = useCallback(async (options?: { replaceRetainedTake?: boolean }) => {
    if (startInFlight.current || recordingState === 'recording' || displayedPhase !== 'duration_selection') {
      return;
    }

    const hasRetainedTake = Boolean(retainedCompletedTake || (recordingState === 'completed' && recordingUri));
    const startDecision = recordingStartDecision({
      hasRetainedTake,
      replaceRetainedTake: Boolean(options?.replaceRetainedTake),
      retainedTakeHydrating,
    });
    if (startDecision === 'wait-for-retained-take-hydration') {
      setActionError('Checking for a saved take before starting.');
      return;
    }
    if (startDecision === 'confirm-retained-take-replacement') {
      setRetainedTakeStartPromptVisible(true);
      return;
    }

    const operationId = ++operationGeneration.current;
    startInFlight.current = true;
    setIsStarting(true);
    setActionError(null);
    if (hasRetainedTake && options?.replaceRetainedTake) {
      try {
        await deleteRetainedCompletedTake(recordingUri);
        dispatch({ type: 'DELETE_RECORDING' });
      } catch (deleteError) {
        setActionError(deleteError instanceof Error ? deleteError.message : 'Unable to delete saved take.');
        setIsStarting(false);
        startInFlight.current = false;
        return;
      }
    }
    ++micFlowIdentityGenerationRef.current;
    micFlowIdentityRef.current = null;
    pendingMicFlowCompletionRef.current = null;
    const identity = await establishAnonymousMicFlowSession({
      isCurrent: () => operationId === operationGeneration.current,
    });
    if (operationId === operationGeneration.current && identity) {
      recordingOwnerIdRef.current = identity.userId;
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
        void audio.discardTransientRecording().catch(() => undefined);
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
              void audio.discardTransientRecording().catch(() => undefined);
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
  }, [
    audio,
    clearCountdown,
    deleteRetainedCompletedTake,
    dispatch,
    displayedPhase,
    recordingState,
    recordingUri,
    retainedCompletedTake,
    retainedTakeHydrating,
  ]);

  const keepSavedTake = useCallback(() => {
    void audio.stopPlayback().catch(() => undefined);
    setRetainedTakeStartPromptVisible(false);
    setPhase('topic_reveal');
  }, [audio]);

  const deleteTakeAndStart = useCallback(() => {
    void beginRecording({ replaceRetainedTake: true });
  }, [beginRecording]);

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
      void deleteRetainedCompletedTake(previousRecordingUri).catch(() => undefined);
    }
  }, [beginNewTake, deleteRetainedCompletedTake, dispatch, recordingUri, selectedDurationSeconds, topic.id]);

  const retryAttempt = useCallback(async () => {
    try {
      operationGeneration.current += 1;
      await deleteRetainedCompletedTake(recordingUri);
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
  }, [beginNewTake, chooseNewTopic, deleteRetainedCompletedTake, dispatch, recordingUri, takeTwoBaselineRunId]);

  const deleteAttempt = useCallback(async () => {
    try {
      operationGeneration.current += 1;
      await deleteRetainedCompletedTake(recordingUri);
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
  }, [beginNewTake, chooseNewTopic, deleteRetainedCompletedTake, dispatch, recordingUri]);

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
                {recoveryPresentation && displayedPhase !== 'completion' && (
                  <View style={styles.recoveryBanner}>
                    <Text style={styles.recoveryBannerText}>
                      {recoveryPresentation === 'retained-take'
                        ? 'You have a completed local take saved on this device.'
                        : 'You have a completed local take ready to claim.'}
                    </Text>
                    <ActionButton
                      label={recoveryPresentation === 'retained-take' ? 'Resume saved take' : 'Resume Quick Read setup'}
                      onPress={() => {
                        if (recoveryPresentation === 'retained-take' && hasHiddenCompletedTake) {
                          setCompletedTakeHidden(false);
                        } else if (recoveryPresentation === 'retained-take' && retainedCompletedTake) {
                          showRetainedCompletedTake(retainedCompletedTake);
                        } else {
                          setIsAuthFlowVisible(true);
                        }
                      }}
                      secondary
                    />
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
                    onDeleteTakeAndStart={deleteTakeAndStart}
                    onKeepSavedTake={keepSavedTake}
                    prompt={topic.prompt}
                    retainedTakePromptVisible={retainedTakeStartPromptVisible}
                    selectedDuration={selectedDurationSeconds}
                    setDuration={(duration) => {
                      if (!takeTwoBaselineRunId) {
                        dispatch({ type: 'SELECT_DURATION', duration });
                      }
                    }}
                    showPermissionRetry={recordingState === 'permission_denied' || Boolean(recordingError)}
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
            cleanupPending={cleanupPending || cleanupInFlight.current}
            isCompleting={recordingState === 'completing'}
            isPaused={recordingState === 'paused' || recordingState === 'cancelling'}
            onCancel={() => void cancelActiveRecording()}
            onHoldRelease={() => dispatch({ type: 'CANCEL_HOLD_RELEASED' })}
            onHoldStart={() => dispatch({ type: 'CANCEL_HOLD_STARTED' })}
            onResume={() => void resumeRecording()}
            onStop={() => void stopRecording()}
            prompt={topic.prompt}
            reducedMotion={reducedMotion}
            remainingMs={remainingMs}
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
            actionLabel={
              recordingFailureKind === 'persistence'
                ? 'Retry Save'
                : recordingFailureKind === 'cleanup'
                  ? 'Retry Cleanup'
                  : 'Try again'
            }
            body={actionError ?? recordingError ?? 'The take failed safely. Your local state is still intact.'}
            onAction={() => {
              if (recordingFailureKind === 'persistence') {
                void retrySaveFinalizedAttempt();
              } else if (recordingFailureKind === 'cleanup') {
                void retryCleanupRecording();
              } else {
                void retryAttempt();
              }
            }}
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
            onDismiss={() => void closeCompletedTake()}
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
  onDeleteTakeAndStart,
  onKeepSavedTake,
  onPermissionRetry,
  prompt,
  retainedTakePromptVisible,
  selectedDuration,
  setDuration,
  showPermissionRetry,
  stackedDurations,
}: {
  actionError: string | null;
  isStarting: boolean;
  locked: boolean;
  onBegin: () => void;
  onDeleteTakeAndStart: () => void;
  onKeepSavedTake: () => void;
  onPermissionRetry: () => void;
  prompt: string;
  retainedTakePromptVisible: boolean;
  selectedDuration: RecordingDuration;
  setDuration: (duration: RecordingDuration) => void;
  showPermissionRetry: boolean;
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
          {showPermissionRetry && <ActionButton label="Try microphone permission again" onPress={onPermissionRetry} secondary />}
        </View>
      )}
      {retainedTakePromptVisible && (
        <View
          accessibilityLabel="Saved take decision"
          style={styles.retainedTakePrompt}
          testID="retained-take-start-prompt">
          <Text accessibilityRole="header" style={styles.retainedTakeTitle}>You have a saved take.</Text>
          <Text style={styles.retainedTakeBody}>Keep it for later, or delete it before starting a new Drop.</Text>
          <ActionButton label="Keep Saved Take" onPress={onKeepSavedTake} secondary />
          <ActionButton
            accessibilityHint="Deletes the saved local recording before starting this new Drop"
            label="Delete Take and Start"
            onPress={onDeleteTakeAndStart}
          />
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
  cleanupPending,
  isCompleting,
  isPaused,
  onCancel,
  onHoldRelease,
  onHoldStart,
  onResume,
  onStop,
  prompt,
  reducedMotion,
  remainingMs,
  selectedDuration,
}: {
  cleanupPending: boolean;
  isCompleting: boolean;
  isPaused: boolean;
  onCancel: () => void;
  onHoldRelease: () => void;
  onHoldStart: () => void;
  onResume: () => void;
  onStop: () => void;
  prompt: string;
  reducedMotion: boolean;
  remainingMs: number;
  selectedDuration: RecordingDuration;
}) {
  return (
    <View style={styles.centerSection}>
      <RecordingPulse isPaused={isPaused} reducedMotion={reducedMotion} />
      <Text style={styles.eyebrow}>{isPaused ? 'PAUSED' : 'RECORDING'}</Text>
      <Text accessibilityLiveRegion="polite" style={styles.timer}>{formatSpeakingTime(remainingMs)}</Text>
      <Text style={styles.timerTarget}>{selectedDuration}s Drop</Text>
      <PromptCard prompt={prompt} />
      {isPaused ? (
        <View
          accessibilityLabel="Paused recording controls"
          style={[styles.actionStack, styles.pausedControlColumn]}
          testID="paused-control-column">
          <ActionButton
            accessibilityHint="Continues recording into the same local audio file"
            disabled={cleanupPending}
            label="Resume"
            onPress={onResume}
          />
          <HoldToCancel
            disabled={cleanupPending}
            onCancel={onCancel}
            onHoldRelease={onHoldRelease}
            onHoldStart={onHoldStart}
            reducedMotion={reducedMotion}
          />
        </View>
      ) : (
        <ActionButton
          accessibilityHint="Pauses this recording without finalizing it"
          disabled={isCompleting}
          label={isCompleting ? 'Saving Drop…' : 'Stop'}
          onPress={onStop}
        />
      )}
    </View>
  );
}

function RecordingPulse({ isPaused, reducedMotion }: { isPaused: boolean; reducedMotion: boolean }) {
  const [opacity] = useState(() => new Animated.Value(isPaused || reducedMotion ? 0.85 : 1));

  useEffect(() => {
    if (isPaused || reducedMotion) {
      opacity.stopAnimation();
      opacity.setValue(isPaused ? 0.45 : 0.85);
      return;
    }
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { duration: 900, toValue: 0.35, useNativeDriver: true }),
        Animated.timing(opacity, { duration: 900, toValue: 1, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [isPaused, opacity, reducedMotion]);

  return <Animated.View style={[styles.liveDot, { opacity }]} />;
}

function CompletionView({
  completedAtMs,
  elapsed,
  micFlowCompletionMessage,
  micFlowSavePromptVisible,
  micFlowStatus,
  onMicFlowSaveDecision,
  onDelete,
  onDismiss,
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
  onDismiss: () => void;
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
        <View style={styles.completionHeaderRow}>
          <View />
          <Pressable
            accessibilityHint="Returns to Today’s Drop and keeps this recording for later."
            accessibilityLabel="Close completed take"
            accessibilityRole="button"
            onPress={onDismiss}
            style={styles.completionCloseButton}
            testID="close-completed-take">
            <Text maxFontSizeMultiplier={1.5} style={styles.completionCloseText}>×</Text>
          </Pressable>
        </View>
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
  retainedTakePrompt: { backgroundColor: colors.surfaceMuted, borderRadius: radii.lg, gap: spacing.md, padding: spacing.lg },
  retainedTakeTitle: { color: colors.inkStrong, ...typography.title },
  retainedTakeBody: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  countdownNumber: { color: colors.coral, fontFamily: typography.displayFamily, fontSize: 138, fontWeight: '700', lineHeight: 150 },
  countdownNumberStatic: { opacity: 0.9 },
  centerPrompt: { color: colors.muted, fontFamily: typography.displayFamily, fontSize: 21, lineHeight: 29, maxWidth: 560, textAlign: 'center' },
  liveDot: { backgroundColor: colors.coral, borderRadius: radii.pill, height: 16, width: 16 },
  timer: { color: colors.inkStrong, fontFamily: typography.displayFamily, fontSize: 78, fontWeight: '700', letterSpacing: -1 },
  timerTarget: { color: colors.muted, fontSize: 12, fontWeight: '900', letterSpacing: 2 },
  completionHeaderRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  completionCloseButton: { alignItems: 'center', borderRadius: radii.pill, justifyContent: 'center', minHeight: 48, minWidth: 48 },
  completionCloseText: { color: colors.ink, fontSize: 34, fontWeight: '300', lineHeight: 38 },
  completionMark: { alignItems: 'center', backgroundColor: colors.ink, borderRadius: radii.pill, height: 82, justifyContent: 'center', width: 82 },
  completionMarkText: { color: colors.successSoft, fontSize: 48, fontWeight: '300' },
  completionMeta: { color: colors.muted, fontSize: 13 },
  actionStack: { gap: spacing.md },
  pausedControlColumn: { alignItems: 'stretch', maxWidth: 360, minWidth: 260, width: '100%' },
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
