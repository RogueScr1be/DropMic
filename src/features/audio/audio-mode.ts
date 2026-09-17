import { setAudioModeAsync, setIsAudioActiveAsync } from 'expo-audio';

export const AUTOMATIC_AUDIO_MODE = {
  allowsRecording: false,
  interruptionMode: 'mixWithOthers' as const,
  playsInSilentMode: false,
  shouldPlayInBackground: false,
  shouldRouteThroughEarpiece: false,
};

export const EXPLICIT_PLAYBACK_AUDIO_MODE = {
  allowsRecording: false,
  interruptionMode: 'mixWithOthers' as const,
  playsInSilentMode: true,
  shouldPlayInBackground: false,
  shouldRouteThroughEarpiece: false,
};

export const RECORDING_AUDIO_MODE = {
  allowsRecording: true,
  allowsBackgroundRecording: false,
  playsInSilentMode: true,
};

let audioModeQueue = Promise.resolve();

function enqueueAudioMode(operation: () => Promise<void>) {
  const nextOperation = audioModeQueue.then(operation, operation);
  audioModeQueue = nextOperation.catch(() => undefined);
  return nextOperation;
}

export function configureAutomaticAudioMode() {
  return enqueueAudioMode(async () => {
    await setIsAudioActiveAsync(true);
    await setAudioModeAsync(AUTOMATIC_AUDIO_MODE);
  });
}

export function configureExplicitPlaybackAudioMode() {
  return enqueueAudioMode(async () => {
    await setIsAudioActiveAsync(true);
    await setAudioModeAsync(EXPLICIT_PLAYBACK_AUDIO_MODE);
  });
}

export function configureRecordingAudioMode() {
  return enqueueAudioMode(() => setAudioModeAsync(RECORDING_AUDIO_MODE));
}
