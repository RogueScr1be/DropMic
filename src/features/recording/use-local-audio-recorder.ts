import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
} from 'expo-audio';
import { File } from 'expo-file-system';
import { detectWebRecordingMimeType } from './web-recording-format';

const recorderOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  directory: 'document' as const,
  ...(Platform.OS === 'web'
    ? { mimeType: detectWebRecordingMimeType() ?? undefined }
    : {}),
};

export function useLocalAudioRecorder() {
  const [permissionGranted, setPermissionGranted] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorder = useAudioRecorder(recorderOptions, (status) => {
    if (status.error) {
      setError(status.error);
    }
  });
  const recorderState = useAudioRecorderState(recorder, 200);
  const player = useAudioPlayer();
  const playerStatus = useAudioPlayerStatus(player);
  const lastPlayerUri = useRef<string | null>(null);
  const [isPlaybackPlaying, setIsPlaybackPlaying] = useState(false);
  const recorderPhase = useRef<'idle' | 'prepared' | 'recording' | 'paused' | 'finalized'>('idle');
  const finalizedUri = useRef<string | null>(null);
  const retainedUris = useRef(new Set<string>());
  const deletedUris = useRef(new Set<string>());
  const deletePromises = useRef(new Map<string, Promise<void>>());
  const finalizePromise = useRef<Promise<string | null> | null>(null);
  const discardPromise = useRef<Promise<void> | null>(null);

  useEffect(() => {
    void getRecordingPermissionsAsync().then((permission) => setPermissionGranted(permission.granted));
  }, []);

  useEffect(() => {
    if (lastPlayerUri.current) {
      setIsPlaybackPlaying(Boolean(playerStatus.playing) && !playerStatus.didJustFinish);
    }
  }, [playerStatus.didJustFinish, playerStatus.playing]);

  const requestPermission = useCallback(async () => {
    const permission = await requestRecordingPermissionsAsync();
    setPermissionGranted(permission.granted);
    return permission.granted;
  }, []);

  const prepare = useCallback(async () => {
    setError(null);
    finalizedUri.current = null;
    finalizePromise.current = null;
    discardPromise.current = null;
    await setAudioModeAsync({
      allowsRecording: true,
      allowsBackgroundRecording: false,
      playsInSilentMode: true,
    });
    await recorder.prepareToRecordAsync();
    recorderPhase.current = 'prepared';
  }, [recorder]);

  const start = useCallback(async () => {
    if (recorderPhase.current !== 'prepared') {
      return;
    }
    recorder.record();
    recorderPhase.current = 'recording';
  }, [recorder]);

  const pause = useCallback(async () => {
    if (recorderPhase.current !== 'recording') {
      return;
    }
    await recorder.pause();
    recorderPhase.current = 'paused';
  }, [recorder]);

  const resume = useCallback(async () => {
    if (recorderPhase.current !== 'paused') {
      return;
    }
    recorder.record();
    recorderPhase.current = 'recording';
  }, [recorder]);

  const finalize = useCallback(async () => {
    if (finalizePromise.current) {
      return finalizePromise.current;
    }
    if (recorderPhase.current === 'finalized') {
      return finalizedUri.current ?? recorder.uri;
    }

    finalizePromise.current = (async () => {
      if (recorderPhase.current === 'prepared') {
        recorder.record();
        recorderPhase.current = 'recording';
      }
      if (recorderPhase.current === 'recording' || recorderPhase.current === 'paused') {
        await recorder.stop();
        recorderPhase.current = 'finalized';
        finalizedUri.current = recorder.uri;
      }
      return finalizedUri.current ?? recorder.uri;
    })();

    try {
      return await finalizePromise.current;
    } finally {
      finalizePromise.current = null;
    }
  }, [recorder]);

  const play = useCallback(
    async (uri: string) => {
      if (lastPlayerUri.current !== uri) {
        player.replace(uri);
        lastPlayerUri.current = uri;
      }
      await player.seekTo(0);
      player.play();
      setIsPlaybackPlaying(true);
    },
    [player],
  );

  const pausePlayback = useCallback(async () => {
    if (!lastPlayerUri.current) {
      return;
    }
    player.pause();
    setIsPlaybackPlaying(false);
  }, [player]);

  const stopPlayback = useCallback(async () => {
    if (!lastPlayerUri.current) {
      return;
    }
    try {
      player.pause();
      setIsPlaybackPlaying(false);
      await Promise.resolve(player.seekTo(0)).catch(() => undefined);
      player.remove();
      lastPlayerUri.current = null;
      setError(null);
    } catch {
      throw new Error('Unable to stop saved take playback. Your saved take is still available.');
    }
  }, [player]);

  const deleteRecording = useCallback(async (uri: string) => {
    if (deletedUris.current.has(uri)) {
      return;
    }
    const pendingDelete = deletePromises.current.get(uri);
    if (pendingDelete) {
      return pendingDelete;
    }

    const deletePromise = (async () => {
      if (lastPlayerUri.current === uri) {
        await stopPlayback();
      }
      if (Platform.OS === 'web') {
        if (uri.startsWith('blob:')) {
          URL.revokeObjectURL(uri);
        }
        deletedUris.current.add(uri);
        return;
      }
      await new File(uri).delete();
      deletedUris.current.add(uri);
    })();

    deletePromises.current.set(uri, deletePromise);
    try {
      await deletePromise;
    } finally {
      deletePromises.current.delete(uri);
    }
  }, [stopPlayback]);

  const discardTransientRecording = useCallback(async () => {
    if (discardPromise.current) {
      return discardPromise.current;
    }

    discardPromise.current = (async () => {
      const uri = await finalize();
      if (uri && !retainedUris.current.has(uri)) {
        await deleteRecording(uri);
      }
      recorderPhase.current = 'idle';
      finalizedUri.current = null;
    })();

    try {
      await discardPromise.current;
    } finally {
      discardPromise.current = null;
    }
  }, [deleteRecording, finalize]);

  const retainFinalizedRecording = useCallback((uri: string) => {
    retainedUris.current.add(uri);
  }, []);

  const releaseRetainedRecording = useCallback((uri: string) => {
    retainedUris.current.delete(uri);
  }, []);

  const reset = useCallback(() => {
    recorderPhase.current = 'idle';
    finalizedUri.current = null;
    finalizePromise.current = null;
    discardPromise.current = null;
  }, []);

  useEffect(() => () => {
    if (recorderPhase.current !== 'idle') {
      void discardTransientRecording().catch(() => undefined);
    }
  }, [discardTransientRecording]);

  const deleteRetainedRecording = useCallback(async (uri: string) => {
    releaseRetainedRecording(uri);
    await deleteRecording(uri);
    if (finalizedUri.current === uri) {
      reset();
    }
  }, [deleteRecording, releaseRetainedRecording, reset]);

  return {
    permissionGranted,
    isRecording: recorderState.isRecording,
    mediaServicesDidReset: recorderState.mediaServicesDidReset,
    isPlaybackPlaying,
    error,
    uri: recorder.uri,
    requestPermission,
    prepare,
    start,
    pause,
    resume,
    finalize,
    play,
    pausePlayback,
    stopPlayback,
    deleteRecording: deleteRetainedRecording,
    discardTransientRecording,
    retainFinalizedRecording,
    releaseRetainedRecording,
    reset,
  };
}
