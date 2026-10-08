Warning: truncated output (original token count: 24574)
Total output lines: 2382

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { SignupFlow } from '@/features/auth/SignupFlow';
import { useAuthFlowStore } from '@/features/auth/auth-flow-store';
import { clearUnclaimedAttempt, getUnclaimedAttempt, saveAndVerifyUnclaimedAttempt, type UnclaimedAttempt } from '@/features/auth/auth-recovery';
import { claimChallengeAttempt, claimUnclaimedAttempt, getOwnedAttemptId, getSession } from '@/features/auth/auth-service';
import { isSupabaseConfigured, supabase } from '@/features/auth/auth-client';
import { useCompletionBell } from '@/features/completion/completion-sound';
import { CompletionMark } from '@/features/completion/CompletionMark';
import {
  prepareAnonymousMicFlowSession,
  createMicFlowSnapshotCoordinator,
  getMicFlowOwnerId,
  recordMicFlowCompletion,
  type MicFlowCompletion,
  type MicFlowRecordingIdentity,
  type MicFlowSnapshot,
} from '@/features/mic-flow/mic-flow-service';
import { MicFlowCard } from '@/features/mic-flow/MicFlowCard';
import { trackEvent } from '@/features/analytics/analytics';
import { ChallengeRecoveryAction, ChallengeShareAction } from '@/features/challenge/ChallengeShareAction';
import { ChallengeTransitionView } from '@/features/challenge/ChallengeTransitionView';
import {
  clearChallengeAttemptSession,
  getChallengeAttemptSession,
  markChallengeAcceptanceRecorded,
  saveChallengeAttemptSession,
  shouldPreserveChallengeAttemptOnBackground,
  shouldRecordChallengeAcceptance,
} from '@/features/challenge/challenge-attempt-session';
import { createPersistAndShareChallenge, isChallengeShareEligible } from '@/features/challenge/challenge-share-action';
import { findActiveChallengeForAttempt, resolveChallenge, rotateChallengeLink, type OwnerChallenge } from '@/features/challenge/challenge-service';
import {
  challengePreparationError,
  isChallengeDestinationCommitted,
  shouldStartChallengePreparation,
  type ChallengePreparationState,
  type ChallengeTransitionStage,
} from '@/features/challenge/challenge-transition';
import { getChallengeShareLink, saveChallengeShareLink, type ChallengeShareLinkRecord } from '@/features/challenge/challenge-share-storage';
import {
  clearPendingChallenge,
  confirmPendingChallenge,
  getPendingChallenge,
  savePendingChallenge,
} from '@/features/challenge/challenge-routing';
import { PlusPaywall } from '@/features/billing/PlusPaywall';
import { SkillPacksStore } from '@/features/billing/SkillPacksStore';
import { bindRevenueCatSession } from '@/features/billing/revenuecat-session';
import { getPlusDisplayEligibility } from '@/features/billing/plus-display';
import { getOwnedSkillPackIds } from '@/features/billing/skill-pack-service';
import { SKILL_PACKS, type SkillPackId, type SkillPackPracticeContent } from '@/features/topics/skill-packs';
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
import { SettingsSheet } from '@/features/settings/SettingsSheet';
import {
  consumeTakeIdentity,
  createConsumedTakeIdentity,
  createPendingTakeIdentity,
  createTakeIdentity,
  prepareIdentityForRecording,
  type TakeIdentity,
  type TakeIdentityLifecycle,
} from '@/features/quick-read/attempt-identity';
import { createTakeTwoTake } from '@/features/quick-read/take-two-journey';
import { useLocalAudioRecorder } from '@/features/recording/use-local-audio-recorder';
import { HoldToCancel } from '@/features/recording/HoldToCancel';
import {
  clearLocalCompletedTake,
  LOCAL_COMPLETED_TAKE_VERSION,
  type LocalCompletedTake,
} from '@/features/recording/local-completed-take';
import {
  deleteSavedDrop,
  getSavedDrops,
  saveAndVerifySavedDrop,
  SavedDropLimitError,
  type SavedDrop,
} from '@/features/recording/saved-drops';
import {
  deriveActiveElapsedMs,
  isInterruptibleState,
  isRecordingState,
  type RecordingDuration,
} from '@/features/recording/recording-machine';
import { useRecordingStore } from '@/features/recording/recording-store';
import { detectWebRecordingMimeType } from '@/features/recording/web-recording-format';
import { getTopicById, selectNextPackTopic, selectNextTopic, type SpeakingTopic } from '@/features/topics/topic-catalog';
import { SolariBoard } from '@/features/solari/SolariBoard';
import { ActionButton } from '@/ui/ActionButton';
import { AppHeader } from '@/ui/AppHeader';
import { AppShell } from '@/ui/AppShell';
import { DurationPicker } from '@/ui/DurationPicker';
import { PromptCard } from '@/ui/PromptCard';
import { colors, radii, spacing, typography } from '@/ui/theme';
import { ShareCard } from '@/features/share/ShareCard';
import { shareDropCard } from '@/features/share/share-service';

type ExperiencePhase = FirstUsePhase | 'interrupted' | 'error';

const COMPLETION_HEADLINES = ['Great Job!'] as const;

export default function AudioProofScreen() {
  const audio = useLocalAudioRecorder();
  const { auth, challenge, challengeConfirmed } = useLocalSearchParams<{ auth?: string; challenge?: string; challengeConfirmed?: string }>();
  const router = useRouter();
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
  const [authFlowMode, setAuthFlowMode] = useState<'conversion' | 'sign-in'>('conversion');
  const [isQuickReadVisible, setIsQuickReadVisible] = useState(false);
  const [quickReadAutoStart, setQuickReadAutoStart] = useState(false);
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);
  const [isPlusPaywallVisible, setIsPlusPaywallVisible] = useState(false);
  const [isSkillPacksStoreVisible, setIsSkillPacksStoreVisible] = useState(false);
  const [ownedPackIds, setOwnedPackIds] = useState<SkillPackId[]>([]);
  const [activePackId, setActivePackId] = useState<SkillPackId | null>(null);
  const [activePackContent, setActivePackContent] = useState<SkillPackPracticeContent | null>(null);
  const [plusEnabled, setPlusEnabled] = useState(false);
  const [challengeAttempt, setChallengeAttempt] = useState(false);
  const [activeChallengeToken, setActiveChallengeToken] = useState<string | null>(null);
  const [authenticatedUserId, setAuthenticatedUserId] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [takeIdentity, setTakeIdentity] = useState<TakeIdentity>(() => createTakeIdentity());
  const [takeTwoBaselineRunId, setTakeTwoBaselineRunId] = useState<string | null>(null);
  const [micFlowStatus, setMicFlowStatus] = useState<'idle' | 'pending' | 'protected' | 'unprotected' | 'save_decision_required'>('idle');
  const [micFlowSnapshot, setMicFlowSnapshot] = useState<MicFlowSnapshot | null>(null);
  const [micFlowSnapshotLoading, setMicFlowSnapshotLoading] = useState(false);
  const [micFlowSavePromptVisible, setMicFlowSavePromptVisible] = useState(false);
  const [retainedCompletedTake, setRetainedCompletedTake] = useState<SavedDrop | null>(null);
  const [completedTakeHidden, setCompletedTakeHidden] = useState(false);
  const [retainedTakeStartPromptVisible, setRetainedTakeStartPromptVisible] = useState(false);
  const [retainedTakeHydrating, setRetainedTakeHydrating] = useState(true);
  const [requiresNewDropAfterDevLogin, setRequiresNewDropAfterDevLogin] = useState(false);
  const [challengeShareLink, setChallengeShareLink] = useState<ChallengeShareLinkRecord | null>(null);
  const [ownerChallenge, setOwnerChallenge] = useState<OwnerChallenge | null>(null);
  const [challengeLinkReadyForClientAttempt, setChallengeLinkReadyForClientAttempt] = useState<string | null>(null);
  const [challengeLinkActionInFlight, setChallengeLinkActionInFlight] = useState(false);
  const [challengePreparation, setChallengePreparation] = useState<ChallengePreparationState>(() => (
    challengeConfirmed === '1' && challenge
      ? { stage: 'root_transition_started', status: 'preparing' }
      : { status: 'idle' }
  ));
  const challengeHandledRef = useRef<string | null>(null);
  const challengeResolvingRef = useRef<string | null>(null);
  const challengePreparationGenerationRef = useRef(0);
  const challengeAcceptanceTelemetryRef = useRef<string | null>(null);
  const billingOwnerIdRef = useRef<string | null>(null);
  const playCompletionBell = useCompletionBell();
  const stopInFlight = useRef(false);
  const completionInFlight = useRef(false);
  const cleanupInFlight = useRef(false);
  const startInFlight = useRef(false);
  const operationGeneration = useRef(0);
  const countdownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const takeIdentityLifecycleRef = useRef<TakeIdentityLifecycle>(createPendingTakeIdentity(takeIdentity));
  const takeTwoStartInFlight = useRef(false);
  const micFlowCompletionRef = useRef<string | null>(null);
  const micFlowIdentityRef = useRef<MicFlowRecordingIdentity | null>(null);
  const recordingOwnerIdRef = useRef<string | null>(null);
  const micFlowIdentityGenerationRef = useRef(0);
  const pendingMicFlowCompletionRef = useRef<{ input: MicFlowCompletion; identity: MicFlowRecordingIdentity; generation: number } | null>(null);
  const micFlowDecisionInFlight = useRef(false);
  const micFlowSnapshotRequestRef = useRef(0);
  const challengeLinkHydrationRef = useRef(0);
  const micFlowSnapshotCoordinatorRef = useRef(createMicFlowSnapshotCoordinator());
  const discardTransientRecordingRef = useRef(audio.discardTransientRecording);

  const elapsed = useMemo(
    () => deriveActiveElapsedMs(elapsedMs, startedAtMs, nowMs, selectedDurationSeconds * 1000),
    [elapsedMs, nowMs, selectedDurationSeconds, startedAtMs],
  );
  const remainingMs = Math.max(0, selectedDurationSeconds * 1000 - elapsed);
  const statePhase = phaseForRecordingState(recordingState);
  const hasHiddenCompletedTake = recordingState === 'completed' && completedTakeHidden && Boolean(recordingUri);
  const hasRetainedTakeAvailable = hasHiddenCompletedTake || Boolean(retainedCompletedTake);
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
  const retainedChallengeMetadata = useMemo(() => {
    const retainedTopic = retainedCompletedTake ? getTopicById(retainedCompletedTake.topicId) : null;
    const category = retainedCompletedTake?.category ?? retainedTopic?.category;
    const promptMatches = retainedCompletedTake && (retainedTopic
      ? retainedTopic.prompt === retainedCompletedTake.prompt
      : Boolean(retainedCompletedTake.category));
    return retainedCompletedTake && category && promptMatches
      ? {
        category,
        durationSeconds: retainedCompletedTake.selectedDurationSeconds,
        prompt: retainedCompletedTake.prompt,
      }
      : null;
  }, [retainedCompletedTake]);
  const challengeShareEligible = isChallengeShareEligible({
    authenticatedUserId,
    category: retainedChallengeMetadata?.category ?? null,
    durationSeconds: retainedChallengeMetadata?.durationSeconds ?? null,
    localUriMatches: Boolean(retainedCompletedTake && recordingUri === retainedCompletedTake.localUri),
    persisted: Boolean(retainedCompletedTake),
    prompt: retainedChallengeMetadata?.prompt ?? null,
    recordingCompleted: recordingState === 'completed',
    recordingUri,
    savedDropOwnerId: retainedCompletedTake?.ownerId ?? null,
  });
  const retainedSavedDropEligible = isChallengeShareEligible({
    authenticatedUserId,
    category: retainedChallengeMetadata?.category ?? null,
    durationSeconds: retainedChallengeMetadata?.durationSeconds ?? null,
    localUriMatches: Boolean(retainedCompletedTake),
    persisted: Boolean(retainedCompletedTake),
    prompt: retainedChallengeMetadata?.prompt ?? null,
    recordingCompleted: true,
    recordingUri: retainedCompletedTake?.localUri ?? null,
    savedDropOwnerId: retainedCompletedTake?.ownerId ?? null,
  });
  const challengeLinkReady = Boolean(
    authenticatedUserId &&
    retainedCompletedTake &&
    retainedCompletedTake.ownerId === authenticatedUserId &&
    challengeLinkReadyForClientAttempt === retainedCompletedTake.clientAttemptId,
  );
  const challengeLinkHydrating = Boolean(authenticatedUserId && retainedCompletedTake && retainedCompletedTake.ownerId === authenticatedUserId) && !challengeLinkReady;
  const activeChallengeShareLink = challengeLinkReady ? challengeShareLink : null;
  const activeOwnerChallenge = challengeLinkReady ? ownerChallenge : null;
  const quickReadOwnsSettings = isQuickReadVisible;
  const settingsHidden = quickReadOwnsSettings || isAuthFlowVisible || isSettingsVisible || micFlowSavePromptVisible || isSkillPacksStoreVisible || isPlusPaywallVisible;
  const showSideFlow = false;

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
    const requestId = ++challengeLinkHydrationRef.current;
    let cancelled = false;
    if (!authenticatedUserId || !retainedCompletedTake || retainedCompletedTake.ownerId !== authenticatedUserId) {
      return () => {
        cancelled = true;
      };
    }

    void (async () => {
      try {
        const attemptId = serverAttemptId ?? await getOwnedAttemptId(retainedCompletedTake.clientAttemptId);
        if (!attemptId) {
          if (!cancelled && requestId === challengeLinkHydrationRef.current) {
            setChallengeLinkReadyForClientAttempt(retainedCompletedTake.clientAttemptId);
          }
          return;
        }
        if (!serverAttemptId) {
          setServerAttemptId(attemptId);
        }
        const storedLink = await getChallengeShareLink(authenticatedUserId, attemptId);
        const activeChallenge = storedLink ? null : await findActiveChallengeForAttempt(attemptId);
        if (cancelled || requestId !== challengeLinkHydrationRef.current) {
          return;
        }
        setChallengeShareLink(storedLink);
        setOwnerChallenge(activeChallenge);
        setChallengeLinkReadyForClientAttempt(retainedCompletedTake.clientAttemptId);
      } catch (error) {
        if (!cancelled && requestId === challengeLinkHydrationRef.current) {
          setActionError(error instanceof Error ? error.message : 'The existing challenge could not be verified.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authenticatedUserId, retainedCompletedTake, serverAttemptId]);

  useEffect(() => {
    let cancelled = false;
    void getSession().then((session) => {
      if (!cancelled) {
        setAuthenticatedUserId(session?.user && !session.user.is_anonymous ? session.user.id : null);
      }
    }).catch(() => {
      if (!cancelled) {
        setAuthenticatedUserId(null);
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

  const ignoreSolariComplete = useCallback(() => undefined, []);

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
      const restored = (await getSavedDrops(ownerId))[0] ?? null;
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
    void Promise.all([getPlusDisplayEligibility(), getOwnedSkillPackIds()]).then(([plus, packs]) => {
      setPlusEnabled(plus);
      setOwnedPackIds(packs);
    });
  }, []);

  useEffect(() => {
    void trackEvent('app_opened');
  }, []);

  useEffect(() => {
    void trackEvent('prompt_viewed', { dedupeKey: `prompt:${topic.id}` });
  }, [topic.id]);

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
    let billingRefresh: ReturnType<typeof setTimeout> | null = null;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      handleMicFlowAuthTransition(session);
      const nextOwnerId = session?.user && !session.user.is_anonymous ? session.user.id : null;
      setAuthenticatedUserId(nextOwnerId);
      if (billingOwnerIdRef.current !== nextOwnerId) {
        billingOwnerIdRef.current = nextOwnerId;
        setOwnedPackIds([]);
        setActivePackId(null);
        setActivePackContent(null);
      }
      if (billingRefresh) clearTimeout(billingRefresh);
      billingRefresh = setTimeout(() => {
        void Promise.all([getPlusDisplayEligibility(), getOwnedSkillPackIds()]).then(([plus, packs]) => {
          setPlusEnabled(plus);
          setOwnedPackIds(packs);
        });
      }, 0);
      if (session?.user) {
        void refreshMicFlowSnapshot({ ownerId: session.user.id });
      } else {
        setMicFlowSnapshotLoading(false);
      }
    });
    return () => {
      if (billingRefresh) clearTimeout(billingRefresh);
      data.subscription.unsubscribe();
    };
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
        takeIdentityLifecycleRef.current.identity.clientAttemptId !== pending.input.completionId ||
        micFlowIdentityRef.current?.userId !== pending.identity.userId
      ) {
        return;
      }
      if (result.status === 'save_decision_required') {
        setMicFlowStatus('save_decision_required');
        setMicFlowSavePromptVisible(true);
      } else if (result.status === 'credited' || result.status === 'already_credited' || result.status === 'same_day') {
        setMicFlowStatus('protected');
        setMicFlowSavePromptVisible(false);
        void refreshMicFlowSnapshot({ force: true, ownerId: pending.identity.userId });
      } else if (result.status === 'unavailable' && (result.reason === 'not_configured' || result.reason === 'unowned' || result.reason === 'stale_identity')) {
        setMicFlowStatus('unprotected');
        setMicFlowSavePromptVisible(false);
      } else if (result.status === 'unavailable' && useSave !== null) {
        setMicFlowStatus('save_decision_required');
        setMicFlowSavePromptVisible(true);
      } else {
        setMicFlowStatus('idle');
      }
    } catch {
      setMicFlowStatus('unprotected');
      setMicFlowSavePromptVisible(false);
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
      mode: challengeAttempt ? 'challenge_response' : 'cold_take',
      topicId: attempt.topicId,
      selectedDurationSeconds: attempt.selectedDurationSeconds,
      completedDurationSeconds: attempt.completedDurationSeconds,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    };
    const generation = micFlowIdentityGenerationRef.current;
    pendingMicFlowCompletionRef.current = { input, identity, generation };
    void submitMicFlowCompletion(null);
  }, [challengeAttempt, submitMicFlowCompletion]);

  const persistFinalizedAttempt = useCallback(async (completedAtMsForAttempt: number, activeElapsedMs: number) => {
    const attempt: UnclaimedAttempt = {
      audioRetained: false,
      clientAttemptId: takeIdentityLifecycleRef.current.identity.clientAttemptId,
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
    const retainedTake: SavedDrop = {
      version: LOCAL_COMPLETED_TAKE_VERSION,
      savedDropId: takeIdentityLifecycleRef.current.identity.clientAttemptId,
      clientAttemptId: takeIdentityLifecycleRef.current.identity.clientAttemptId,
      completedAt: new Date(completedAtMsForAttempt).toISOString(),
      completedDurationSeconds: Math.round(activeElapsedMs / 1000),
      localUri: uri,
      ownerId,
      prompt: topic.prompt,
      category: topic.category,
      quickReadIdempotencyKey: takeIdentityLifecycleRef.current.identity.quickReadIdempotencyKey,
      selectedDurationSeconds,
      topicId: topic.id,
    };
    try {
      const verifiedTake = await saveAndVerifySavedDrop(retainedTake, { plus: await getPlusDisplayEligibility() });
      setRetainedCompletedTake(verifiedTake);
      return verifiedTake;
    } catch (error) {
      if (error instanceof SavedDropLimitError) {
        await trackEvent('saved_drop_limit_reached', { dedupeKey: `saved-limit:${retainedTake.ownerId}:${new Date().toISOString().slice(0, 10)}` });
        setActionError('You have three Saved Drops. Upgrade to Plus to keep this new Drop, or delete an older one.');
      }
      throw error;
    }
  }, [selectedDurationSeconds, topic.category, topic.id, topic.prompt]);

  const beginNewTake = useCallback((comparisonBaselineRunId: string | null = null, nextTakeIdentity = createTakeIdentity()) => {
    micFlowIdentityGenerationRef.current += 1;
    micFlowIdentityRef.current = null;
    pendingMicFlowCompletionRef.current = null;
    micFlowCompletionRef.current = null;
    recordingOwnerIdRef.current = null;
    takeIdentityLifecycleRef.current = createPendingTakeIdentity(nextTakeIdentity);
    setTakeIdentity(nextTakeIdentity);
    setChallengeAttempt(false);
    setServerAttemptId(null);
    setTakeTwoBaselineRunId(comparisonBaselineRunId);
    setIsQuickReadVisible(false);
    setMicFlowStatus('idle');
    setMicFlowSavePromptVisible(false);
    setRetainedTakeStartPromptVisible(false);
  }, []);

  const reportChallengeTransitionStage = useCallback((stage: ChallengeTransitionStage) => {
    if (__DEV__) {
      console.info(`[DropMic] challenge transition: ${stage}`);
    }
  }, []);

  const prepareChallenge = useCallback(async (token: string, recordAcceptance: boolean) => {
    if (!shouldStartChallengePreparation(token, challengeHandledRef.current, challengeResolvingRef.current)) {
      return;
    }
    const generation = challengePreparationGenerationRef.current + 1;
    challengePreparationGenerationRef.current = generation;
    challengeResolvingRef.current = token;
    setChallengePreparation({ stage: 'challenge_resolution_started', status: 'preparing' });
    reportChallengeTransitionStage('challenge_resolution_started');
    try {
      const resolved = await resolveChallenge(token);
      if (challengePreparationGenerationRef.current !== generation) {
        return;
      }
      reportChallengeTransitionStage('challenge_resolution_succeeded');
      if (recordAcceptance) {
        const confirmed = await confirmPendingChallenge(token);
        if (!confirmed) {
          await savePendingChallenge({ source: 'micdrop', token }, 'confirmed');
        }
        reportChallengeTransitionStage('pending_state_saved');
      }
      if (challengePreparationGenerationRef.current !== generation) {
        return;
      }
      challengeHandledRef.current = token;
      challengeResolvingRef.current = null;
      const restoredSession = await getChallengeAttemptSession(token);
      const nextIdentity = restoredSession?.identity ?? createTakeIdentity();
      beginNewTake(null, nextIdentity);
      setActiveChallengeToken(token);
      setChallengeAttempt(true);
      const nextTopic = {
        category: restoredSession?.category ?? resolved.category ?? 'Challenge',
        id: 'challenge',
        prompt: restoredSession?.prompt ?? resolved.prompt,
      };
      setActivePackId(null);
      setActivePackContent(null);
      setTopic(nextTopic);
      const nextDuration = restoredSession?.durationSeconds ?? resolved.durationSeconds;
      dispatch({ type: 'SELECT_DURATION', duration: nextDuration });
      await saveChallengeAttemptSession({
        acceptanceRecorded: restoredSession?.acceptanceRecorded ?? false,
        category: nextTopic.category,
        durationSeconds: nextDuration,
        identity: nextIdentity,
        prompt: nextTopic.prompt,
        token,
      });
      setPhase('topic_reveal');
      setChallengePreparation({ status: 'ready' });
    } catch (reason) {
      if (challengePreparationGenerationRef.current !== generation) {
        return;
      }
      challengeResolvingRef.current = null;
      setChallengePreparation({ message: challengePreparationError(reason), stage: 'transition_failed', status: 'error' });
      reportChallengeTransitionStage('transition_failed');
    }
  }, [beginNewTake, dispatch, reportChallengeTransitionStage]);

  useEffect(() => {
    if (challengeConfirmed !== '1' || !challenge || !splashElapsed || ageGateAccepted === null) {
      return;
    }
    void Promise.resolve().then(() => prepareChallenge(challenge, true));
  }, [ageGateAccepted, challenge, challengeConfirmed, prepareChallenge, splashElapsed]);

  useEffect(() => {
    if (challenge || !splashElapsed || ageGateAccepted === null) {
      return;
    }
    let cancelled = false;
    void getPendingChallenge().then((pending) => {
      if (!cancelled && pending?.state === 'confirmed') {
        void prepareChallenge(pending.token, false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [ageGateAccepted, challenge, prepareChallenge, splashElapsed]);

  useEffect(() => {
    const transitionToken = challenge ?? activeChallengeToken;
    if (!transitionToken || !isChallengeDestinationCommitted(challengePreparation, displayedPhase)) {
      return;
    }
    if (challengeAcceptanceTelemetryRef.current === transitionToken) {
      return;
    }
    challengeAcceptanceTelemetryRef.current = transitionToken;
    void trackEvent('challenge_link_opened');
    void (async () => {
      const session = await getChallengeAttemptSession(transitionToken);
      if (!shouldRecordChallengeAcceptance(challengeConfirmed === '1', session?.acceptanceRecorded ?? false)) {
        return;
      }
      const marked = session ? await markChallengeAcceptanceRecorded(transitionToken) : true;
      if (marked) {
        void trackEvent('challenge_accepted');
      }
    })();
    reportChallengeTransitionStage('destination_committed');
  }, [activeChallengeToken, challenge, challengeConfirmed, challengePreparation, displayedPhase, reportChallengeTransitionStage]);

  const dismissChallengePreparation = useCallback(() => {
    challengePreparationGenerationRef.current += 1;
    challengeResolvingRef.current = null;
    void clearPendingChallenge();
    void clearChallengeAttemptSession();
    setChallengePreparation({ status: 'idle' });
    router.replace('/');
  }, [router]);

  const showRetainedCompletedTake = useCallback((take: LocalCompletedTake) => {
    const catalogTopic = getTopicById(take.topicId);
    setTopic(catalogTopic && catalogTopic.prompt === take.prompt
      ? catalogTopic
      : { category: take.category ?? 'Recovered', id: take.topicId, prompt: take.prompt });
    const restoredIdentity = {
      clientAttemptId: take.clientAttemptId,
      quickReadIdempotencyKey: take.quickReadIdempotencyKey,
    };
    takeIdentityLifecycleRef.current = createConsumedTakeIdentity(restoredIdentity);
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
        if (challengeAttempt) {
          if (!activeChallengeToken) {
            throw new Error('The challenge response could not be identified safely.');
          }
          await claimChallengeAttempt(savedAttempt, activeChallengeToken);
        }
        if (operationId !== operationGeneration.current || useRecordingStore.getState().state !== 'completing') {
          return;
        }
        audio.retainFinalizedRecording(uri);
        setCompletedTakeHidden(false);
        dispatch({ type: 'PERSISTENCE_CONFIRMED', completedAtMs: completedAtMsForAttempt });
        playCompletionBell(savedAttempt.clientAttemptId);
        exposeVerifiedCompletion(savedAttempt);
        void trackEvent('recording_completed', { dedupeKey: `recording-completed:${savedAttempt.clientAttemptId}` });
        if (challengeAttempt) {
          void trackEvent('challenge_recording_completed', { dedupeKey: `challenge-recording-completed:${savedAttempt.clientAttemptId}` });
          void clearPendingChallenge();
          void clearChallengeAttemptSession();
          setActiveChallengeToken(null);
          setChallengeAttempt(false);
        }
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
  }, [activeChallengeToken, audio, challengeAttempt, dispatch, exposeVerifiedCompletion, persistFinalizedAttempt, persistLocalCompletedTake, playCompletionBell]);

  const cancelActiveRecording = useCallback(async () => {
    const currentState = useRecordingStore.getState();
    if (cleanupInFlight.current || (currentState.state !== 'paused' && currentState.state !== 'cancelling')) {
      return;
    }

    const operationId = ++operationGeneration.current;
    cleanupInFlight.current = true;
    dispatch({ type: 'CANCEL_CONFIRMED…4574 tokens truncated…   }
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
    if (requiresNewDropAfterDevLogin) {
      setActionError('Create a new Drop before starting a Quick Read.');
      return false;
    }
    if (micFlowSavePromptVisible) {
      setActionError('Choose whether to use a Mic Save before starting Quick Read.');
      return false;
    }
    try {
      const requestedTakeId = takeIdentityLifecycleRef.current.identity.clientAttemptId;
      const session = await getSession();
      if (takeIdentityLifecycleRef.current.identity.clientAttemptId !== requestedTakeId) {
        return false;
      }
      if (!session?.user || session.user.is_anonymous) {
        setAuthFlowMode('conversion');
        setIsSettingsVisible(false);
        setIsAuthFlowVisible(true);
        return false;
      }
      const attemptId = serverAttemptId ?? (await claimUnclaimedAttempt(currentAttempt));
      if (takeIdentityLifecycleRef.current.identity.clientAttemptId !== requestedTakeId) {
        return false;
      }
      if (typeof attemptId !== 'string') {
        setActionError('Finish account setup before starting a Quick Read.');
        setAuthFlowMode('conversion');
        setIsSettingsVisible(false);
        setIsAuthFlowVisible(true);
        return false;
      }
      setIsAuthFlowVisible(false);
      setIsSettingsVisible(false);
      setServerAttemptId(attemptId);
      setQuickReadAutoStart(true);
      setIsQuickReadVisible(true);
      return true;
    } catch (openError) {
      setActionError(openError instanceof Error ? openError.message : 'Sign in before starting a Quick Read.');
      setAuthFlowMode('conversion');
      setIsSettingsVisible(false);
      setIsAuthFlowVisible(true);
      return false;
    }
  }, [currentAttempt, micFlowSavePromptVisible, requiresNewDropAfterDevLogin, serverAttemptId]);

  const shareSavedDrop = useCallback(async () => {
    if (!challengeShareEligible || !retainedCompletedTake || !retainedChallengeMetadata || !authenticatedUserId) {
      return;
    }
    if (activeChallengeShareLink) {
      await shareDropCard({ prompt: retainedChallengeMetadata.prompt, challengeUrl: activeChallengeShareLink.url });
      return;
    }
    const requestTakeId = retainedCompletedTake.clientAttemptId;
    const attemptId = serverAttemptId ?? await claimUnclaimedAttempt(currentAttempt);
    if (takeIdentityLifecycleRef.current.identity.clientAttemptId !== requestTakeId) {
      return;
    }
    if (typeof attemptId !== 'string') {
      throw new Error('The saved Drop is not ready for challenge sharing.');
    }
    setServerAttemptId(attemptId);
    const challenge = await createPersistAndShareChallenge({
      attemptId,
      category: retainedChallengeMetadata.category,
      durationSeconds: retainedChallengeMetadata.durationSeconds,
      prompt: retainedChallengeMetadata.prompt,
    }, authenticatedUserId);
    const persistedLink: ChallengeShareLinkRecord = {
      version: 1,
      ownerId: authenticatedUserId,
      attemptId,
      challengeId: challenge.challengeId as string,
      url: challenge.url,
      expiresAt: challenge.expiresAt,
    };
    setChallengeShareLink(persistedLink);
    setOwnerChallenge({
      id: persistedLink.challengeId,
      attemptId,
      prompt: retainedChallengeMetadata.prompt,
      category: retainedChallengeMetadata.category,
      durationSeconds: retainedChallengeMetadata.durationSeconds,
      expiresAt: challenge.expiresAt,
    });
  }, [activeChallengeShareLink, authenticatedUserId, challengeShareEligible, currentAttempt, retainedChallengeMetadata, retainedCompletedTake, serverAttemptId]);

  const shareExistingChallenge = useCallback(async () => {
    if (!activeChallengeShareLink || !retainedChallengeMetadata) {
      return;
    }
    await shareDropCard({ prompt: retainedChallengeMetadata.prompt, challengeUrl: activeChallengeShareLink.url });
  }, [activeChallengeShareLink, retainedChallengeMetadata]);

  const regenerateChallengeLink = useCallback(async () => {
    if (challengeLinkActionInFlight || !authenticatedUserId || !retainedCompletedTake || !retainedChallengeMetadata) {
      return;
    }
    setChallengeLinkActionInFlight(true);
    try {
      const attemptId = serverAttemptId ?? await getOwnedAttemptId(retainedCompletedTake.clientAttemptId);
      if (!attemptId) {
        throw new Error('The saved Drop is not ready for challenge-link recovery.');
      }
      const challenge = await rotateChallengeLink(attemptId);
      const persistedLink: ChallengeShareLinkRecord = {
        version: 1,
        ownerId: authenticatedUserId,
        attemptId,
        challengeId: challenge.challengeId,
        url: challenge.url,
        expiresAt: challenge.expiresAt,
      };
      await saveChallengeShareLink(persistedLink);
      setChallengeShareLink(persistedLink);
      setOwnerChallenge({
        id: challenge.challengeId,
        attemptId,
        prompt: challenge.prompt,
        category: challenge.category,
        durationSeconds: challenge.durationSeconds,
        expiresAt: challenge.expiresAt,
      });
      await shareDropCard({ prompt: challenge.prompt, challengeUrl: challenge.url });
    } finally {
      setChallengeLinkActionInFlight(false);
    }
  }, [authenticatedUserId, challengeLinkActionInFlight, retainedChallengeMetadata, retainedCompletedTake, serverAttemptId]);

  const handleDeveloperLogin = useCallback(() => {
    setRequiresNewDropAfterDevLogin(true);
    if (useRecordingStore.getState().state === 'completed') {
      void closeCompletedTake();
    }
  }, [closeCompletedTake]);

  const retainedTakeCard = recoveryPresentation === 'retained-take' ? (
    <RetainedTakeCard
      challengeAction={(
        retainedSavedDropEligible && !challengeLinkHydrating && activeChallengeShareLink ? (
          <ChallengeShareAction eligible mode="reuse" onError={setActionError} onShare={shareExistingChallenge} />
        ) : retainedSavedDropEligible && !challengeLinkHydrating && activeOwnerChallenge ? (
          <ChallengeRecoveryAction disabled={challengeLinkActionInFlight} onError={setActionError} onRecover={regenerateChallengeLink} />
        ) : null
      )}
      onResume={() => {
        if (hasHiddenCompletedTake) {
          setCompletedTakeHidden(false);
        } else if (retainedCompletedTake) {
          showRetainedCompletedTake(retainedCompletedTake);
        }
      }}
    />
  ) : null;

  if (challengePreparation.status === 'preparing' || challengePreparation.status === 'error') {
    return <ChallengeTransitionView onDismiss={dismissChallengePreparation} state={challengePreparation} />;
  }

  if (displayedPhase === 'splash') {
    return <SplashReveal reducedMotion={reducedMotion} />;
  }

  return (
    <>
      <AppShell
        header={displayedPhase === 'completion' ? null : (
          <AppHeader
            onBack={displayedPhase === 'duration_selection' ? () => setPhase('topic_reveal') : undefined}
            onSettings={() => {
              if (quickReadOwnsSettings) {
                return;
              }
              setIsAuthFlowVisible(false);
              setIsQuickReadVisible(false);
              setIsSettingsVisible(true);
            }}
            settingsHidden={settingsHidden}
          />
        )}>
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
            <View style={[styles.experienceGrid, showSideFlow && layout.useTwoColumns && displayedPhase !== 'topic_reveal' && styles.experienceGridWide]}>
              <View style={styles.primaryColumn} testID="primary-region">
                {recoveryPresentation === 'auth-recovery' && displayedPhase !== 'completion' && (
                  <View style={styles.recoveryBanner}>
                    <Text style={styles.recoveryBannerText}>You have a completed local take ready to claim.</Text>
                    <ActionButton
                      label="Resume Quick Read setup"
                      onPress={() => setIsAuthFlowVisible(true)}
                      secondary
                    />
                  </View>
                )}

                {displayedPhase === 'topic_reveal' && (
                  <TopicReveal
                    density={layout.solariDensity}
                    activePackTitle={activePackId ? SKILL_PACKS.find((pack) => pack.id === activePackId)?.title ?? null : null}
                    difficulty={activePackId ? topic.difficulty ?? null : null}
                    onExplorePacks={activeChallengeToken ? undefined : () => setIsSkillPacksStoreVisible(true)}
                    onComplete={ignoreSolariComplete}
                    onContinue={() => setPhase('duration_selection')}
                    onNewDrop={chooseNewTopic}
                    onFreePrompt={activePackId ? chooseFreeTopic : undefined}
                    prompt={topic.prompt}
                    reducedMotion={reducedMotion}
                    revealKey={revealKey}
                    flowCard={(
                      <View style={styles.flowStack} testID="flow-region">
                        <MicFlowCard loading={micFlowSnapshotLoading} snapshot={micFlowSnapshot} />
                        {retainedTakeCard}
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
                    onUpgrade={() => setIsPlusPaywallVisible(true)}
                    onDeleteTakeAndStart={deleteTakeAndStart}
                    onKeepSavedTake={keepSavedTake}
                    prompt={topic.prompt}
                    retainedTakePromptVisible={retainedTakeStartPromptVisible || hasRetainedTakeAvailable}
                    selectedDuration={selectedDurationSeconds}
                    plusEnabled={plusEnabled}
                    setDuration={(duration) => {
                      if (!takeTwoBaselineRunId) {
                        dispatch({ type: 'SELECT_DURATION', duration });
                      }
                    }}
                    showPermissionRetry={recordingState === 'permission_denied' || Boolean(recordingError)}
                    stackedDurations={layout.stackControls}
                    supportCard={(
                      <View style={styles.flowStack} testID="flow-region">
                        <MicFlowCard loading={micFlowSnapshotLoading} snapshot={micFlowSnapshot} />
                        {retainedTakeCard}
                      </View>
                    )}
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
            flowCard={(
              <View style={styles.flowColumnStacked} testID="flow-region">
                <MicFlowCard loading={micFlowSnapshotLoading} snapshot={micFlowSnapshot} />
              </View>
            )}
            headline={COMPLETION_HEADLINES[0]}
            isPlaybackPlaying={audio.isPlaybackPlaying}
            micFlowSavePromptVisible={micFlowSavePromptVisible}
            micFlowStatus={micFlowStatus}
            onMicFlowSaveDecision={(useSave) => void submitMicFlowCompletion(useSave)}
            onDelete={() => void deleteAttempt()}
            onDismiss={() => void closeCompletedTake()}
            onPause={() => void audio.pausePlayback().catch(() => undefined)}
            onPlay={() =>
              void audio.play(recordingUri).catch((playError) => {
                setActionError(playError instanceof Error ? playError.message : 'Unable to play recording.');
                dispatch({ type: 'FAILURE', message: playError instanceof Error ? playError.message : 'Unable to play recording.' });
              })
            }
            onQuickRead={openQuickRead}
            onShare={shareSavedDrop}
            onShareError={setActionError}
            onRetry={() => void retryAttempt()}
            prompt={topic.prompt}
            recordingUri={recordingUri}
            reducedMotion={reducedMotion}
            challengeCategory={retainedChallengeMetadata?.category ?? null}
            challengeDurationSeconds={retainedChallengeMetadata?.durationSeconds ?? null}
            shareChallengeEligible={challengeShareEligible && !challengeLinkHydrating && (!activeOwnerChallenge || Boolean(activeChallengeShareLink))}
            shareChallengeMode={activeChallengeShareLink ? 'reuse' : 'create'}
          />
                )}
              </View>

              {showSideFlow && displayedPhase !== 'topic_reveal' && displayedPhase !== 'recording' && displayedPhase !== 'countdown' && displayedPhase !== 'completion' && (
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
        mode={authFlowMode}
        onAttemptClaimed={setServerAttemptId}
        onDeveloperLogin={handleDeveloperLogin}
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
      <SettingsSheet
        onClose={() => setIsSettingsVisible(false)}
        onOpenSignIn={() => {
          setAuthFlowMode('sign-in');
          useAuthFlowStore.getState().setStep('sign_in_email');
          setIsQuickReadVisible(false);
          setIsAuthFlowVisible(true);
        }}
        onSignedOut={() => {
          handleMicFlowAuthTransition(null);
          setMicFlowSnapshotLoading(false);
          setMicFlowSavePromptVisible(false);
          setMicFlowStatus('unprotected');
          setActionError('Signed out. Your local recording remains on this device.');
        }}
        visible={isSettingsVisible}
      />
      <QuickReadFlow
        autoStart={quickReadAutoStart}
        key={takeIdentity.clientAttemptId}
        attemptId={serverAttemptId}
        audioExtension={quickReadAudioExtension(recordingUri)}
        audioUri={recordingUri}
        idempotencyKey={takeIdentity.quickReadIdempotencyKey}
        onClose={() => {
          setIsQuickReadVisible(false);
          setQuickReadAutoStart(false);
          if (takeTwoBaselineRunId) {
            setTakeTwoBaselineRunId(null);
          }
        }}
        onOpenPlus={() => {
          setIsQuickReadVisible(false);
          setIsPlusPaywallVisible(true);
        }}
        onTakeTwo={beginTakeTwo}
        prompt={topic.prompt}
        reducedMotion={reducedMotion}
        takeTwoBaselineRunId={takeTwoBaselineRunId}
        takeId={takeIdentity.clientAttemptId}
        visible={isQuickReadVisible}
      />
      <PlusPaywall onAccessUpdated={setPlusEnabled} onClose={() => setIsPlusPaywallVisible(false)} visible={isPlusPaywallVisible} />
      <SkillPacksStore
        key={authenticatedUserId ?? 'signed-out'}
        ownedPackIds={ownedPackIds}
        onClose={() => setIsSkillPacksStoreVisible(false)}
        onOwnedPacksUpdated={setOwnedPackIds}
        onPlusAccessUpdated={setPlusEnabled}
        onPractice={practicePackTopic}
        visible={isSkillPacksStoreVisible}
      />
    </>
  );
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

function TopicReveal({
  activePackTitle,
  difficulty,
  density,
  flowCard,
  onComplete,
  onContinue,
  onExplorePacks,
  onFreePrompt,
  onNewDrop,
  prompt,
  reducedMotion,
  revealKey,
}: {
  activePackTitle: string | null;
  difficulty: number | null;
  density: 'compact-landscape' | 'phone' | 'tablet';
  flowCard: ReactNode;
  onComplete: () => void;
  onContinue: () => void;
  onExplorePacks?: () => void;
  onFreePrompt?: () => void;
  onNewDrop: () => void;
  prompt: string;
  reducedMotion: boolean;
  revealKey: number;
}) {
  return (
    <View style={styles.section} testID="topic-reveal">
      <Text accessibilityRole="header" maxFontSizeMultiplier={1.5} style={styles.heroTitle}>Today’s Drop</Text>
      {activePackTitle && <Text accessibilityRole="text" style={styles.packPracticeLabel}>{activePackTitle}{difficulty ? ` · Level ${difficulty}` : ''}</Text>}
      <ActionButton
        accessibilityHint="Shows a different local prompt"
        label="New Drop!"
        onPress={onNewDrop}
        emphasizedBorder
        secondary
      />
      <SolariBoard
        density={density}
        onComplete={onComplete}
        prompt={prompt}
        reducedMotion={reducedMotion}
        revealKey={revealKey}
      />
      <ActionButton
        accessibilityHint="Opens recording preparation for this prompt"
        label="Let’s Go!"
        onPress={onContinue}
        testID="prompt-continue"
      />
      {onFreePrompt && <ActionButton label="Choose a free prompt" onPress={onFreePrompt} secondary />}
      {onExplorePacks && <ActionButton label="Explore Skill Packs" onPress={onExplorePacks} secondary />}
      {flowCard}
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
  onUpgrade,
  prompt,
  retainedTakePromptVisible,
  selectedDuration,
  plusEnabled,
  setDuration,
  showPermissionRetry,
  stackedDurations,
  supportCard,
}: {
  actionError: string | null;
  isStarting: boolean;
  locked: boolean;
  onBegin: () => void;
  onDeleteTakeAndStart: () => void;
  onKeepSavedTake: () => void;
  onPermissionRetry: () => void;
  onUpgrade: () => void;
  prompt: string;
  retainedTakePromptVisible: boolean;
  selectedDuration: RecordingDuration;
  plusEnabled: boolean;
  setDuration: (duration: RecordingDuration) => void;
  showPermissionRetry: boolean;
  stackedDurations: boolean;
  supportCard: ReactNode;
}) {
  const replacementChoiceRequired = retainedTakePromptVisible;

  return (
    <View style={styles.section} testID="duration-selection">
      <Text accessibilityRole="header" style={styles.sectionTitle}>Today’s Drop</Text>
      <PromptCard prompt={prompt} />
      {locked && <Text style={styles.lockedTakeNote}>TAKE TWO · SAME PROMPT AND CLOCK</Text>}
      <DurationPicker disabled={locked} onChange={setDuration} onUpgrade={onUpgrade} plusEnabled={plusEnabled} selected={selectedDuration} stacked={stackedDurations} />
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
          <ActionButton
            accessibilityHint="Keeps the saved recording recoverable and starts this new Drop"
            label="Keep Saved Take and Start"
            onPress={onKeepSavedTake}
            secondary
          />
          <ActionButton
            accessibilityHint="Deletes the saved local recording before starting this new Drop"
            label="Delete Take and Start"
            onPress={onDeleteTakeAndStart}
          />
        </View>
      )}
      {!replacementChoiceRequired && (
        <ActionButton
          accessibilityHint="Starts microphone preparation and the countdown"
          disabled={isStarting}
          label={isStarting ? 'Preparing your Drop…' : 'Let’s Go!'}
          onPress={onBegin}
        />
      )}
      {supportCard}
    </View>
  );
}

function RetainedTakeCard({ challengeAction, onResume }: { challengeAction: ReactNode; onResume: () => void }) {
  return (
    <View
      accessibilityLabel="Saved take card"
      style={styles.retainedFileStack}
      testID="retained-take-card">
      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.retainedFileBack} />
      <View style={styles.retainedFileFront}>
        <View>
          <Text style={styles.retainedFileKicker}>SAVED DROP</Text>
        </View>
        <ActionButton
          accessibilityHint="Reopens the saved local recording"
          label="Resume Saved Drop"
          onPress={onResume}
          secondary
        />
        {challengeAction}
      </View>
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
  challengeCategory,
  challengeDurationSeconds,
  flowCard,
  headline,
  isPlaybackPlaying,
  micFlowSavePromptVisible,
  micFlowStatus,
  onMicFlowSaveDecision,
  onDelete,
  onDismiss,
  onPause,
  onPlay,
  onQuickRead,
  onShare,
  onShareError,
  onRetry,
  prompt,
  recordingUri,
  reducedMotion,
  shareChallengeEligible,
  shareChallengeMode,
}: {
  challengeCategory: string | null;
  challengeDurationSeconds: RecordingDuration | null;
  flowCard: ReactNode;
  headline: string;
  isPlaybackPlaying: boolean;
  micFlowSavePromptVisible: boolean;
  micFlowStatus: 'idle' | 'pending' | 'protected' | 'unprotected' | 'save_decision_required';
  onMicFlowSaveDecision: (useSave: boolean) => void;
  onDelete: () => void;
  onDismiss: () => void;
  onPause: () => void;
  onPlay: () => void;
  onQuickRead: () => Promise<boolean>;
  onShare: () => Promise<void>;
  onShareError: (message: string) => void;
  onRetry: () => void;
  prompt: string;
  recordingUri: string;
  reducedMotion: boolean;
  shareChallengeEligible: boolean;
  shareChallengeMode: 'create' | 'reuse';
}) {
  const [deleteConfirmationVisible, setDeleteConfirmationVisible] = useState(false);
  const [quickReadStarting, setQuickReadStarting] = useState(false);

  const startQuickRead = async () => {
    if (quickReadStarting) {
      return;
    }
    setQuickReadStarting(true);
    try {
      await onQuickRead();
    } finally {
      setQuickReadStarting(false);
    }
  };

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
        <Text accessibilityRole="header" style={styles.heroTitle}>{headline}</Text>
        <Text style={styles.completionBody}>Drop Saved</Text>
        <Text accessibilityElementsHidden style={styles.recordingMetadata} testID="recording-uri">{recordingUri}</Text>
        <PromptCard prompt={prompt} />
        {challengeCategory && challengeDurationSeconds ? (
          <Text accessibilityLabel={`Challenge details: ${challengeCategory}, ${challengeDurationSeconds} seconds`} style={styles.challengeMetadata}>
            {challengeCategory} · {challengeDurationSeconds}s
          </Text>
        ) : null}
        <ShareCard prompt={prompt} />
        <View style={styles.actionStack}>
          <ActionButton disabled={quickReadStarting} label={quickReadStarting ? 'Starting Quick Read…' : 'Upload & get my Quick Read'} onPress={() => void startQuickRead()} />
          <ChallengeShareAction eligible={shareChallengeEligible} mode={shareChallengeMode} onError={onShareError} onShare={onShare} />
          <ActionButton label={isPlaybackPlaying ? 'Pause' : 'Play Drop'} onPress={isPlaybackPlaying ? onPause : onPlay} secondary />
          {!deleteConfirmationVisible ? (
            <View style={styles.secondaryRow}>
              <ActionButton compact label="Retry Drop" onPress={onRetry} secondary />
              <ActionButton compact label="Delete Drop" onPress={() => setDeleteConfirmationVisible(true)} secondary />
            </View>
          ) : (
            <View accessibilityLabel="Delete Drop confirmation" style={styles.deleteConfirmation}>
              <Text accessibilityRole="header" style={styles.deleteConfirmationTitle}>Delete this Drop?</Text>
              <View style={styles.secondaryRow}>
                <ActionButton compact label="Keep Drop" onPress={() => setDeleteConfirmationVisible(false)} secondary />
                <ActionButton compact label="Delete Drop" onPress={onDelete} />
              </View>
            </View>
          )}
        </View>
        {flowCard}
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
  flowStack: { gap: spacing.md, width: '100%' },
  section: { gap: spacing.xl },
  centerSection: { alignItems: 'center', gap: spacing.xl, justifyContent: 'center', paddingVertical: spacing.xxxl },
  eyebrow: { color: colors.coral, ...typography.eyebrow },
  heroTitle: { color: colors.inkStrong, fontFamily: typography.displayFamily, letterSpacing: -1, ...typography.displayLarge },
  packPracticeLabel: { color: colors.coral, fontSize: 13, fontWeight: '900', letterSpacing: 0.7, textTransform: 'uppercase' },
  sectionTitle: { color: colors.inkStrong, fontFamily: typography.displayFamily, ...typography.displayMedium },
  lockedTakeNote: { color: colors.coral, ...typography.eyebrow },
  inlineNotice: { backgroundColor: colors.dangerSoft, borderRadius: radii.md, gap: spacing.md, padding: spacing.lg },
  inlineNoticeText: { color: colors.danger, fontSize: 14, lineHeight: 21 },
  retainedTakePrompt: { backgroundColor: colors.surfaceMuted, borderRadius: radii.lg, gap: spacing.md, padding: spacing.lg },
  retainedTakeTitle: { color: colors.inkStrong, ...typography.title },
  retainedTakeBody: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  retainedFileStack: { paddingTop: spacing.sm, position: 'relative' },
  retainedFileBack: { backgroundColor: colors.surfaceMuted, borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, height: 74, left: spacing.md, position: 'absolute', right: spacing.md, top: 0, transform: [{ rotate: '-1.5deg' }] },
  retainedFileFront: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, gap: spacing.md, padding: spacing.lg },
  retainedFileKicker: { color: colors.coral, ...typography.eyebrow },
  countdownNumber: { color: colors.coral, fontFamily: typography.displayFamily, fontSize: 138, fontWeight: '700', lineHeight: 150 },
  countdownNumberStatic: { opacity: 0.9 },
  centerPrompt: { color: colors.muted, fontFamily: typography.displayFamily, fontSize: 21, lineHeight: 29, maxWidth: 560, textAlign: 'center' },
  liveDot: { backgroundColor: colors.coral, borderRadius: radii.pill, height: 16, width: 16 },
  timer: { color: colors.inkStrong, fontFamily: typography.displayFamily, fontSize: 78, fontWeight: '700', letterSpacing: -1 },
  timerTarget: { color: colors.muted, fontSize: 12, fontWeight: '900', letterSpacing: 2 },
  completionHeaderRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  completionCloseButton: { alignItems: 'center', borderRadius: radii.pill, justifyContent: 'center', minHeight: 48, minWidth: 48 },
  completionCloseText: { color: colors.ink, fontSize: 34, fontWeight: '300', lineHeight: 38 },
  completionBody: { color: colors.muted, ...typography.body },
  completionMeta: { color: colors.muted, fontSize: 13 },
  challengeMetadata: { color: colors.muted, fontSize: 14, letterSpacing: 0.4, textAlign: 'center' },
  actionStack: { gap: spacing.md },
  deleteConfirmation: { backgroundColor: colors.dangerSoft, borderRadius: radii.md, gap: spacing.md, padding: spacing.lg },
  deleteConfirmationTitle: { color: colors.inkStrong, ...typography.title },
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
