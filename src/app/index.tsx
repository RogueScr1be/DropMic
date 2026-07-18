import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useLocalAudioRecorder } from '@/features/recording/use-local-audio-recorder';
import {
  deriveElapsedMs,
  isRecordingState,
  RECORDING_DURATIONS,
  type RecordingDuration,
} from '@/features/recording/recording-machine';
import { useRecordingStore } from '@/features/recording/recording-store';

const COUNTDOWN_MS = 600;

export default function AudioProofScreen() {
  const audio = useLocalAudioRecorder();
  const state = useRecordingStore((store) => store.state);
  const selectedDurationSeconds = useRecordingStore((store) => store.selectedDurationSeconds);
  const startedAtMs = useRecordingStore((store) => store.startedAtMs);
  const recordingUri = useRecordingStore((store) => store.recordingUri);
  const error = useRecordingStore((store) => store.error);
  const nowMs = useRecordingStore((store) => store.nowMs);
  const dispatch = useRecordingStore((store) => store.dispatch);
  const setNow = useRecordingStore((store) => store.setNow);
  const stopInFlight = useRef(false);
  const countdownTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const elapsed = useMemo(
    () =>
      deriveElapsedMs(
        startedAtMs,
        nowMs,
        selectedDurationSeconds * 1000,
      ),
    [nowMs, selectedDurationSeconds, startedAtMs],
  );
  const stopRecording = useCallback(async () => {
    if (stopInFlight.current || !isRecordingState(state)) {
      return;
    }

    stopInFlight.current = true;
    dispatch({ type: 'STOP_REQUESTED' });
    try {
      const uri = await audio.stop();
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
  }, [audio, dispatch, state]);

  const interruptRecording = useCallback(() => {
    if (stopInFlight.current || !isRecordingState(state)) {
      return;
    }

    stopInFlight.current = true;
    void audio.stop().catch(() => undefined).finally(() => {
      stopInFlight.current = false;
    });
    dispatch({ type: 'RECORDING_INTERRUPTED', reason: 'The recording was interrupted.' });
  }, [audio, dispatch, state]);

  useEffect(() => {
    if (state !== 'recording') {
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
  }, [selectedDurationSeconds, setNow, startedAtMs, state, stopRecording]);

  useEffect(() => {
    if (audio.mediaServicesDidReset && state === 'recording') {
      interruptRecording();
    }
  }, [audio.mediaServicesDidReset, interruptRecording, state]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active' && state === 'recording') {
        interruptRecording();
      }
    });

    return () => subscription.remove();
  }, [interruptRecording, state]);

  useEffect(() => {
    return () => {
      if (countdownTimer.current) {
        clearTimeout(countdownTimer.current);
      }
    };
  }, []);

  const requestPermission = useCallback(async () => {
    dispatch({ type: 'REQUEST_PERMISSION' });
    try {
      const granted = await audio.requestPermission();
      dispatch({ type: granted ? 'PERMISSION_GRANTED' : 'PERMISSION_DENIED' });
    } catch (permissionError) {
      dispatch({
        type: 'FAILURE',
        message:
          permissionError instanceof Error
            ? permissionError.message
            : 'Unable to request microphone permission.',
      });
    }
  }, [audio, dispatch]);

  const startRecording = useCallback(async () => {
    dispatch({ type: 'BEGIN_COUNTDOWN' });
    try {
      await audio.prepare();
      countdownTimer.current = setTimeout(() => {
        void audio
          .start()
          .then(() => dispatch({ type: 'COUNTDOWN_COMPLETE' }))
          .catch((startError) =>
            dispatch({
              type: 'FAILURE',
              message: startError instanceof Error ? startError.message : 'Unable to start recording.',
            }),
          );
      }, COUNTDOWN_MS);
    } catch (prepareError) {
      dispatch({
        type: 'FAILURE',
        message: prepareError instanceof Error ? prepareError.message : 'Unable to prepare recorder.',
      });
    }
  }, [audio, dispatch]);

  const retry = useCallback(async () => {
    if (recordingUri) {
      await audio.deleteRecording(recordingUri);
    }
    dispatch({ type: 'RETRY' });
  }, [audio, dispatch, recordingUri]);

  const deleteRecording = useCallback(async () => {
    if (recordingUri) {
      await audio.deleteRecording(recordingUri);
    }
    dispatch({ type: 'DELETE_RECORDING' });
  }, [audio, dispatch, recordingUri]);

  const isPermissionDenied = state === 'permission_denied';
  const isBusy = state === 'requesting_permission' || state === 'countdown' || state === 'processing';

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text accessibilityRole="header" style={styles.title}>
          MicDrop audio proof
        </Text>
        <Text style={styles.subtitle}>
          Local recording only. Background recording is intentionally disabled.
        </Text>

        <View accessibilityRole="radiogroup" style={styles.durationGroup}>
          {RECORDING_DURATIONS.map((duration) => (
            <Pressable
              key={duration}
              accessibilityLabel={`${duration} seconds`}
              accessibilityRole="radio"
              accessibilityState={{ selected: selectedDurationSeconds === duration }}
              disabled={isBusy || state === 'recording'}
              onPress={() => dispatch({ type: 'SELECT_DURATION', duration })}
              style={[
                styles.durationButton,
                selectedDurationSeconds === duration && styles.selectedDurationButton,
              ]}>
              <Text style={styles.durationButtonText}>{duration}s</Text>
            </Pressable>
          ))}
        </View>

        <Text accessibilityLiveRegion="polite" style={styles.status}>
          {formatStatus(state, elapsed, selectedDurationSeconds)}
        </Text>

        {state === 'idle' && (
          <ActionButton label="Request microphone permission" onPress={requestPermission} />
        )}
        {isPermissionDenied && (
          <>
            <Text style={styles.errorText}>
              Microphone permission is required to record. Enable it in system or browser settings.
            </Text>
            <ActionButton label="Try permission again" onPress={requestPermission} />
          </>
        )}
        {state === 'ready' && (
          <ActionButton label="Start recording" onPress={startRecording} />
        )}
        {state === 'countdown' && (
          <ActionButton
            label="Cancel countdown"
            onPress={() => {
              if (countdownTimer.current) {
                clearTimeout(countdownTimer.current);
              }
              dispatch({ type: 'CANCEL' });
            }}
          />
        )}
        {state === 'recording' && (
          <ActionButton label="Stop recording" onPress={() => void stopRecording()} />
        )}
        {state === 'interrupted' && (
          <>
            <Text style={styles.errorText}>
              Recording stopped safely because the app or audio session was interrupted.
            </Text>
            <ActionButton label="Retry recording" onPress={() => void retry()} />
          </>
        )}
        {state === 'error' && (
          <>
            <Text style={styles.errorText}>{error ?? 'The recording failed safely.'}</Text>
            <ActionButton label="Retry" onPress={() => void retry()} />
          </>
        )}
        {state === 'completed' && recordingUri && (
          <View style={styles.resultActions}>
            <Text accessibilityRole="header" style={styles.completedText}>
              Recording complete
            </Text>
            <ActionButton label="Play recording" onPress={() => void audio.play(recordingUri)} />
            <ActionButton label="Retry recording" onPress={() => void retry()} />
            <ActionButton label="Delete recording" onPress={() => void deleteRecording()} />
          </View>
        )}
        {state === 'processing' && <Text style={styles.processingText}>Finalizing local audio…</Text>}
        {audio.error && <Text style={styles.errorText}>{audio.error}</Text>}
      </View>
    </SafeAreaView>
  );
}

function ActionButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}>
      <Text style={styles.actionButtonText}>{label}</Text>
    </Pressable>
  );
}

function formatStatus(
  state: ReturnType<typeof useRecordingStore.getState>['state'],
  elapsedMs: number,
  durationSeconds: RecordingDuration,
) {
  if (state === 'recording') {
    return `Recording ${formatTime(elapsedMs)} / ${formatTime(durationSeconds * 1000)}`;
  }
  return state.replaceAll('_', ' ');
}

function formatTime(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#fff' },
  container: { flex: 1, gap: 20, justifyContent: 'center', padding: 24, maxWidth: 720, width: '100%', alignSelf: 'center' },
  title: { color: '#111827', fontSize: 32, fontWeight: '700' },
  subtitle: { color: '#374151', fontSize: 16, lineHeight: 24 },
  durationGroup: { flexDirection: 'row', gap: 12 },
  durationButton: { alignItems: 'center', borderColor: '#9ca3af', borderRadius: 10, borderWidth: 1, minHeight: 48, justifyContent: 'center', minWidth: 76, paddingHorizontal: 16 },
  selectedDurationButton: { backgroundColor: '#111827', borderColor: '#111827' },
  durationButtonText: { color: '#111827', fontSize: 16, fontWeight: '600' },
  status: { color: '#111827', fontSize: 20, fontWeight: '600', textTransform: 'capitalize' },
  actionButton: { alignItems: 'center', backgroundColor: '#111827', borderRadius: 10, justifyContent: 'center', minHeight: 52, paddingHorizontal: 20 },
  actionButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  pressed: { opacity: 0.7 },
  resultActions: { gap: 12 },
  completedText: { color: '#166534', fontSize: 20, fontWeight: '700' },
  processingText: { color: '#374151', fontSize: 16 },
  errorText: { color: '#991b1b', fontSize: 16, lineHeight: 24 },
});
