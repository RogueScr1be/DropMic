import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import {
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
} from 'expo-audio';
import { File } from 'expo-file-system';

const recorderOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  directory: 'document' as const,
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
  const lastPlayerUri = useRef<string | null>(null);

  useEffect(() => {
    void getRecordingPermissionsAsync().then((permission) => setPermissionGranted(permission.granted));
  }, []);

  const requestPermission = useCallback(async () => {
    const permission = await requestRecordingPermissionsAsync();
    setPermissionGranted(permission.granted);
    return permission.granted;
  }, []);

  const prepare = useCallback(async () => {
    setError(null);
    await setAudioModeAsync({
      allowsRecording: true,
      allowsBackgroundRecording: false,
      playsInSilentMode: true,
    });
    await recorder.prepareToRecordAsync();
  }, [recorder]);

  const start = useCallback(async () => {
    recorder.record();
  }, [recorder]);

  const stop = useCallback(async () => {
    await recorder.stop();
    return recorder.uri;
  }, [recorder]);

  const play = useCallback(
    async (uri: string) => {
      if (lastPlayerUri.current !== uri) {
        player.replace(uri);
        lastPlayerUri.current = uri;
      }
      player.seekTo(0);
      player.play();
    },
    [player],
  );

  const deleteRecording = useCallback(async (uri: string) => {
    if (Platform.OS === 'web') {
      if (uri.startsWith('blob:')) {
        URL.revokeObjectURL(uri);
      }
      return;
    }
    await new File(uri).delete();
  }, []);

  return {
    permissionGranted,
    isRecording: recorderState.isRecording,
    mediaServicesDidReset: recorderState.mediaServicesDidReset,
    error,
    uri: recorder.uri,
    requestPermission,
    prepare,
    start,
    stop,
    play,
    deleteRecording,
  };
}
