import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Animated, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SignupFlow } from '@/features/auth/SignupFlow';
import { clearUnclaimedAttempt, getUnclaimedAttempt, saveUnclaimedAttempt, type UnclaimedAttempt } from '@/features/auth/auth-recovery';
import { claimUnclaimedAttempt, getSession } from '@/features/auth/auth-service';
import { PREPARATION_COUNTDOWN_MS, formatCountdownNumber, formatSpeakingTime, phaseForRecordingState, type FirstUsePhase } from '@/features/first-use/first-use-flow';
import { SplashReveal } from '@/features/first-use/SplashReveal';
import { useReducedMotion } from '@/features/first-use/use-reduced-motion';
import { QuickReadFlow } from '@/features/quick-read/QuickReadFlow';
import { createTakeIdentity, type TakeIdentity } from '@/features/quick-read/attempt-identity';
import { useLocalAudioRecorder } from '@/features/recording/use-local-audio-recorder';
import {
  deriveElapsedMs,
  isInterruptibleState,
  isRecordingState,
  RECORDING_DURATIONS,
  type RecordingDuration,
} from '@/features/recording/recording-machine';
import { useRecordingStore } from '@/features/recording/recording-store';
import { detectWebRecordingMimeType } from '@/features/recording/web-recording-format';
import { selectNextTopic, type SpeakingTopic } from '@/features/topics/topic-catalog';
import { SolariBoard } from '@/features/solari/SolariBoard';

type ExperiencePhase = FirstUsePhase | 'interrupted' | 'error';

export default function AudioProofScreen() {
  const audio = useLocalAudioRecorder();
  const { auth } = useLocalSearchParams<{ auth?: string }>();
  const { width } = useWindowDimensions();
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
  const [topic, setTopic] = useState<SpeakingTopic>(() => selectNextTopic(null));
  const [revealKey, setRevealKey] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [countdownStartedAtMs, setCountdownStartedAtMs] = useState<number | null>(null);
  const [countdownNowMs, setCountdownNowMs] = useState(0);
  const [actionError, setActionError] = useState<string | null>(null);
  const [recoveryAttempt, setRecoveryAttempt] = useState<UnclaimedAttempt | null>(null);
  const [serverAttemptId, setServerAttemptId] = useState<string | null>(null);
  const [isAuthFlowVisible, setIsAuthFlowVisible] = useState(auth === 'complete');
  const [isQuickReadVisible, setIsQuickReadVisible] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [takeIdentity, setTakeIdentity] = useState<TakeIdentity>(() => createTakeIdentity());
  const stopInFlight = useRef(false);
  const startInFlight = useRef(false);
  const operationGeneration = useRef(0);
  const countdownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const takeIdentityRef = useRef(takeIdentity);

  const isTablet = width >= 700;
  const elapsed = useMemo(
    () => deriveElapsedMs(startedAtMs, nowMs, selectedDurationSeconds * 1000),
    [nowMs, selectedDurationSeconds, startedAtMs],
  );
  const statePhase = phaseForRecordingState(recordingState);
  const displayedPhase: ExperiencePhase =
    statePhase ??
    (recordingState === 'interrupted'
      ? 'interrupted'
      : recordingState === 'error'
        ? 'error'
        : phase);

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

  const refreshRecoveryAttempt = useCallback(async () => {
    setRecoveryAttempt(await getUnclaimedAttempt());
  }, []);

  useEffect(() => {
    void getUnclaimedAttempt().then(setRecoveryAttempt);
  }, [refreshRecoveryAttempt]);

  useEffect(() => {
    if (!currentAttempt) {
      return;
    }
    let cancelled = false;
    void saveUnclaimedAttempt(currentAttempt).then(() => {
      if (!cancelled) {
        setRecoveryAttempt(currentAttempt);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [currentAttempt]);

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
    setTopic((currentTopic) => selectNextTopic(currentTopic.id, Date.now() + revealKey + 1));
    setRevealKey((currentKey) => currentKey + 1);
    setActionError(null);
    setPhase('topic_reveal');
  }, [revealKey]);

  const beginNewTake = useCallback(() => {
    const nextTakeIdentity = createTakeIdentity();
    takeIdentityRef.current = nextTakeIdentity;
    setTakeIdentity(nextTakeIdentity);
    setServerAttemptId(null);
    setIsQuickReadVisible(false);
  }, []);

  const retryAttempt = useCallback(async () => {
    try {
      operationGeneration.current += 1;
      if (recordingUri) {
        await audio.deleteRecording(recordingUri);
      }
      await clearUnclaimedAttempt();
      setRecoveryAttempt(null);
      beginNewTake();
      dispatch({ type: 'RETRY' });
      chooseNewTopic();
    } catch (retryError) {
      setActionError(retryError instanceof Error ? retryError.message : 'Unable to retry recording.');
      dispatch({
        type: 'FAILURE',
        message: retryError instanceof Error ? retryError.message : 'Unable to retry recording.',
      });
    }
  }, [audio, beginNewTake, chooseNewTopic, dispatch, recordingUri]);

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
    return <SplashReveal onComplete={() => setPhase('topic_reveal')} reducedMotion={reducedMotion} />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, isTablet && styles.tabletContent]}
        showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Text style={styles.brand}>MICDROP</Text>
          <Text style={styles.sessionMark}>R0B / LOCAL TAKE</Text>
        </View>

        {recoveryAttempt && displayedPhase !== 'completion' && (
          <View style={styles.recoveryBanner}>
            <Text style={styles.recoveryBannerText}>You have a completed local take ready to claim.</Text>
            <ActionButton label="Resume Quick Read setup" onPress={() => setIsAuthFlowVisible(true)} secondary />
          </View>
        )}

        {displayedPhase === 'topic_reveal' && (
          <TopicReveal
            onComplete={() => setPhase('duration_selection')}
            prompt={topic.prompt}
            reducedMotion={reducedMotion}
            revealKey={revealKey}
            soundEnabled={soundEnabled}
            setSoundEnabled={setSoundEnabled}
          />
        )}

        {displayedPhase === 'duration_selection' && (
          <DurationSelection
            actionError={actionError ?? (recordingState === 'permission_denied' ? 'Microphone access is needed for your take.' : recordingError)}
            isStarting={isStarting}
            onBegin={beginRecording}
            onPermissionRetry={beginRecording}
            prompt={topic.prompt}
            selectedDuration={selectedDurationSeconds}
            setDuration={(duration) => dispatch({ type: 'SELECT_DURATION', duration })}
            topicCategory={topic.category}
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
      </ScrollView>
      <SignupFlow
        attempt={currentAttempt ?? recoveryAttempt}
        onAttemptClaimed={setServerAttemptId}
        onClose={() => {
          setIsAuthFlowVisible(false);
          void refreshRecoveryAttempt();
        }}
        onSignedOut={() => setActionError('Signed out. Your local recording remains on this device.')}
        visible={isAuthFlowVisible}
      />
      <QuickReadFlow
        key={takeIdentity.clientAttemptId}
        attemptId={serverAttemptId}
        audioExtension={quickReadAudioExtension(recordingUri)}
        audioUri={recordingUri}
        idempotencyKey={takeIdentity.quickReadIdempotencyKey}
        onClose={() => setIsQuickReadVisible(false)}
        takeId={takeIdentity.clientAttemptId}
        visible={isQuickReadVisible}
      />
    </SafeAreaView>
  );
}

function TopicReveal({
  onComplete,
  prompt,
  reducedMotion,
  revealKey,
  soundEnabled,
  setSoundEnabled,
}: {
  onComplete: () => void;
  prompt: string;
  reducedMotion: boolean;
  revealKey: number;
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
}) {
  return (
    <View style={styles.section} testID="topic-reveal">
      <Text style={styles.eyebrow}>TODAY’S SPEAKING PROMPT</Text>
      <Text accessibilityRole="header" style={styles.heroTitle}>
        Give the ordinary a little voltage.
      </Text>
      <SolariBoard
        onComplete={onComplete}
        prompt={prompt}
        reducedMotion={reducedMotion}
        revealKey={revealKey}
        soundEnabled={soundEnabled}
      />
      <View style={styles.revealFooter}>
        <Text style={styles.helperText}>Your prompt is ready when the board stops moving.</Text>
        <Pressable
          accessibilityLabel={soundEnabled ? 'Turn reveal sound off' : 'Turn reveal sound on'}
          accessibilityRole="switch"
          accessibilityState={{ checked: soundEnabled }}
          onPress={() => setSoundEnabled(!soundEnabled)}
          style={[styles.soundToggle, !soundEnabled && styles.soundToggleOff]}>
          <Text style={styles.soundToggleText}>{soundEnabled ? 'CLACK / ON' : 'CLACK / OFF'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function DurationSelection({
  actionError,
  isStarting,
  onBegin,
  onPermissionRetry,
  prompt,
  selectedDuration,
  setDuration,
  topicCategory,
}: {
  actionError: string | null;
  isStarting: boolean;
  onBegin: () => void;
  onPermissionRetry: () => void;
  prompt: string;
  selectedDuration: RecordingDuration;
  setDuration: (duration: RecordingDuration) => void;
  topicCategory: string;
}) {
  return (
    <View style={styles.section} testID="duration-selection">
      <Text style={styles.eyebrow}>{topicCategory.toUpperCase()} / YOUR TAKE</Text>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        How much room do you want?
      </Text>
      <PromptCard prompt={prompt} />
      <Text style={styles.label}>SET THE CLOCK</Text>
      <View accessibilityRole="radiogroup" style={styles.durationRow}>
        {RECORDING_DURATIONS.map((duration) => (
          <Pressable
            accessibilityLabel={`${duration} seconds`}
            accessibilityRole="radio"
            accessibilityState={{ selected: selectedDuration === duration }}
            key={duration}
            onPress={() => setDuration(duration)}
            style={[styles.durationButton, selectedDuration === duration && styles.durationButtonSelected]}>
            <Text style={[styles.durationNumber, selectedDuration === duration && styles.durationNumberSelected]}>{duration}</Text>
            <Text style={[styles.durationUnit, selectedDuration === duration && styles.durationUnitSelected]}>SEC</Text>
          </Pressable>
        ))}
      </View>
      {actionError && (
        <View style={styles.inlineNotice}>
          <Text style={styles.inlineNoticeText}>{actionError}</Text>
          <ActionButton label="Try microphone permission again" onPress={onPermissionRetry} secondary />
        </View>
      )}
      <ActionButton disabled={isStarting} label={isStarting ? 'Preparing your take…' : 'Start speaking'} onPress={onBegin} />
      <Text style={styles.privacyNote}>No upload. No analysis. Just one local speaking rep.</Text>
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
    <View style={styles.section}>
      <CompletionMark reducedMotion={reducedMotion} />
      <Text accessibilityRole="header" style={styles.heroTitle}>That’s a take.</Text>
      <Text style={styles.completionMeta}>{formatSpeakingTime(elapsed)} captured · {selectedDuration}s setting</Text>
      <Text accessibilityElementsHidden style={styles.completionMeta}>Completed at {completedAtMs ?? 'local time'}</Text>
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

function PromptCard({ prompt }: { prompt: string }) {
  return (
    <View accessibilityLabel={`Speaking prompt: ${prompt}`} style={styles.promptCard} testID="speaking-prompt">
      <Text style={styles.promptQuote}>“</Text>
      <Text style={styles.promptText}>{prompt}</Text>
    </View>
  );
}

function ActionButton({
  compact = false,
  disabled = false,
  label,
  onPress,
  secondary = false,
}: {
  compact?: boolean;
  disabled?: boolean;
  label: string;
  onPress: () => void;
  secondary?: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.actionButton, compact && styles.compactActionButton, secondary && styles.actionButtonSecondary, pressed && styles.pressed, disabled && styles.disabled]}>
      <Text style={[styles.actionButtonText, secondary && styles.actionButtonTextSecondary]}>{label}</Text>
    </Pressable>
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
  safeArea: { backgroundColor: '#f4ebdd', flex: 1 },
  scrollContent: { gap: 26, padding: 22, paddingBottom: 42 },
  tabletContent: { alignSelf: 'center', maxWidth: 820, width: '100%' },
  topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  brand: { color: '#18332d', fontSize: 15, fontWeight: '900', letterSpacing: 2.2 },
  sessionMark: { color: '#799087', fontSize: 10, fontWeight: '700', letterSpacing: 1.6 },
  section: { gap: 22 },
  centerSection: { alignItems: 'center', gap: 20, justifyContent: 'center', minHeight: 520 },
  eyebrow: { color: '#e4572e', fontSize: 11, fontWeight: '900', letterSpacing: 2.2 },
  heroTitle: { color: '#18332d', fontFamily: 'Georgia', fontSize: 36, fontWeight: '700', letterSpacing: -1, lineHeight: 42 },
  sectionTitle: { color: '#18332d', fontFamily: 'Georgia', fontSize: 30, fontWeight: '700', lineHeight: 36 },
  helperText: { color: '#526c63', flex: 1, fontSize: 13, lineHeight: 19 },
  revealFooter: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  soundToggle: { alignItems: 'center', backgroundColor: '#18332d', borderRadius: 99, minHeight: 44, paddingHorizontal: 14 },
  soundToggleOff: { backgroundColor: '#d9cec0' },
  soundToggleText: { color: '#f4ebdd', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  label: { color: '#799087', fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  durationRow: { flexDirection: 'row', gap: 10 },
  durationButton: { alignItems: 'center', backgroundColor: '#e7dccb', borderColor: '#c4b5a2', borderRadius: 12, borderWidth: 1, flex: 1, minHeight: 82, justifyContent: 'center' },
  durationButtonSelected: { backgroundColor: '#18332d', borderColor: '#18332d' },
  durationNumber: { color: '#18332d', fontFamily: 'Georgia', fontSize: 28, fontWeight: '700' },
  durationNumberSelected: { color: '#f4ebdd' },
  durationUnit: { color: '#799087', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  durationUnitSelected: { color: '#86c7b3' },
  promptCard: { backgroundColor: '#fffaf2', borderColor: '#ded1c1', borderRadius: 16, borderWidth: 1, gap: 3, padding: 20 },
  promptQuote: { color: '#e4572e', fontFamily: 'Georgia', fontSize: 40, height: 28, lineHeight: 42 },
  promptText: { color: '#18332d', fontFamily: 'Georgia', fontSize: 24, fontWeight: '700', lineHeight: 31 },
  inlineNotice: { backgroundColor: '#f8d8ca', borderRadius: 12, gap: 12, padding: 14 },
  inlineNoticeText: { color: '#8c321e', fontSize: 14, lineHeight: 21 },
  actionButton: { alignItems: 'center', backgroundColor: '#e4572e', borderRadius: 12, justifyContent: 'center', minHeight: 56, paddingHorizontal: 20, width: '100%' },
  compactActionButton: { flex: 1, width: undefined },
  actionButtonSecondary: { backgroundColor: 'transparent', borderColor: '#b9aa98', borderWidth: 1 },
  actionButtonText: { color: '#fffaf2', fontSize: 15, fontWeight: '900', letterSpacing: 0.3 },
  actionButtonTextSecondary: { color: '#18332d' },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.45 },
  privacyNote: { color: '#799087', fontSize: 12, textAlign: 'center' },
  countdownNumber: { color: '#e4572e', fontFamily: 'Georgia', fontSize: 148, fontWeight: '700', lineHeight: 160 },
  countdownNumberStatic: { opacity: 0.9 },
  centerPrompt: { color: '#526c63', fontFamily: 'Georgia', fontSize: 21, lineHeight: 29, maxWidth: 560, textAlign: 'center' },
  liveDot: { backgroundColor: '#e4572e', borderRadius: 99, height: 16, width: 16 },
  timer: { color: '#18332d', fontFamily: 'Georgia', fontSize: 82, fontWeight: '700', letterSpacing: -3 },
  timerTarget: { color: '#799087', fontSize: 12, fontWeight: '900', letterSpacing: 2 },
  completionMark: { alignItems: 'center', backgroundColor: '#18332d', borderRadius: 99, height: 82, justifyContent: 'center', width: 82 },
  completionMarkText: { color: '#86c7b3', fontSize: 48, fontWeight: '300' },
  completionMeta: { color: '#799087', fontSize: 13 },
  actionStack: { gap: 12 },
  secondaryRow: { flexDirection: 'row', gap: 12 },
  errorText: { color: '#8c321e', fontSize: 15, lineHeight: 23, textAlign: 'center' },
  recordingMetadata: { height: 0, opacity: 0, width: 0 },
  recoveryBanner: { backgroundColor: '#e7dccb', borderRadius: 14, gap: 10, padding: 14 },
  recoveryBannerText: { color: '#18332d', fontSize: 14, lineHeight: 20 },
});
