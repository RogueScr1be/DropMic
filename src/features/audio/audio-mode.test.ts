import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  setIsAudioActiveAsync: jest.fn(() => Promise.resolve()),
}));

// eslint-disable-next-line import/first
import { setAudioModeAsync } from 'expo-audio';
// eslint-disable-next-line import/first
import {
  AUTOMATIC_AUDIO_MODE,
  configureAutomaticAudioMode,
  configureExplicitPlaybackAudioMode,
  configureRecordingAudioMode,
  EXPLICIT_PLAYBACK_AUDIO_MODE,
  RECORDING_AUDIO_MODE,
} from './audio-mode';

describe('audio mode boundary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('serializes automatic, explicit-playback, and recording modes', async () => {
    await configureAutomaticAudioMode();
    await configureExplicitPlaybackAudioMode();
    await configureRecordingAudioMode();

    expect(setAudioModeAsync).toHaveBeenNthCalledWith(1, AUTOMATIC_AUDIO_MODE);
    expect(setAudioModeAsync).toHaveBeenNthCalledWith(2, EXPLICIT_PLAYBACK_AUDIO_MODE);
    expect(setAudioModeAsync).toHaveBeenNthCalledWith(3, RECORDING_AUDIO_MODE);
  });

  it('continues with the next mode after a mode-setting failure', async () => {
    jest.mocked(setAudioModeAsync).mockRejectedValueOnce(new Error('mode unavailable'));

    await expect(configureExplicitPlaybackAudioMode()).rejects.toThrow('mode unavailable');
    await expect(configureAutomaticAudioMode()).resolves.toBeUndefined();
    expect(setAudioModeAsync).toHaveBeenLastCalledWith(AUTOMATIC_AUDIO_MODE);
  });
});
