import { act, create } from 'react-test-renderer';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Platform } from 'react-native';
import { setAudioModeAsync } from 'expo-audio';

import {
  AUTOMATIC_AUDIO_MODE,
  EXPLICIT_PLAYBACK_AUDIO_MODE,
  RECORDING_AUDIO_MODE,
} from '@/features/audio/audio-mode';
import { useLocalAudioRecorder } from './use-local-audio-recorder';

const mockRecorder = {
  pause: jest.fn<() => Promise<void>>(),
  prepareToRecordAsync: jest.fn<() => Promise<void>>(),
  record: jest.fn<() => void>(),
  stop: jest.fn<() => Promise<void>>(),
  uri: 'file:///drop.m4a',
};

const mockPlayer = {
  pause: jest.fn(),
  play: jest.fn(),
  replace: jest.fn(),
  remove: jest.fn(),
  seekTo: jest.fn<() => Promise<void>>(),
};

const mockDeleteFile = jest.fn<() => Promise<void>>();
const originalRevokeObjectURL = URL.revokeObjectURL;
const originalPlatformOS = Platform.OS;

jest.mock('expo-audio', () => ({
  RecordingPresets: { HIGH_QUALITY: {} },
  getRecordingPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
  requestRecordingPermissionsAsync: jest.fn(() => Promise.resolve({ granted: true })),
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  setIsAudioActiveAsync: jest.fn(() => Promise.resolve()),
  useAudioPlayer: jest.fn(() => mockPlayer),
  useAudioPlayerStatus: jest.fn(() => ({ playing: false })),
  useAudioRecorder: jest.fn(() => mockRecorder),
  useAudioRecorderState: jest.fn(() => ({ isRecording: false, mediaServicesDidReset: false })),
}));

jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation(() => ({ delete: mockDeleteFile })),
}));

function Harness({ expose }: { expose: (api: ReturnType<typeof useLocalAudioRecorder>) => void }) {
  const api = useLocalAudioRecorder();
  expose(api);
  return null;
}

describe('useLocalAudioRecorder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRecorder.uri = 'file:///drop.m4a';
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: jest.fn() });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatformOS });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: originalRevokeObjectURL });
  });

  it('uses one recorder object across pause and resume before finalizing one file', async () => {
    let api!: ReturnType<typeof useLocalAudioRecorder>;
    act(() => {
      create(<Harness expose={(nextApi) => { api = nextApi; }} />);
    });

    await act(async () => {
      await api.prepare();
      await api.start();
      await api.pause();
      await api.resume();
      await api.finalize();
    });

    expect(mockRecorder.prepareToRecordAsync).toHaveBeenCalledTimes(1);
    expect(mockRecorder.record).toHaveBeenCalledTimes(2);
    expect(mockRecorder.pause).toHaveBeenCalledTimes(1);
    expect(mockRecorder.stop).toHaveBeenCalledTimes(1);
    expect(setAudioModeAsync).toHaveBeenNthCalledWith(1, RECORDING_AUDIO_MODE);
    expect(setAudioModeAsync).toHaveBeenLastCalledWith(AUTOMATIC_AUDIO_MODE);
    expect(await api.finalize()).toBe('file:///drop.m4a');
    expect(mockRecorder.prepareToRecordAsync).toHaveBeenCalledTimes(1);
    expect(mockRecorder.stop).toHaveBeenCalledTimes(1);
  });

  it('loads the finalized URI into the player before playback', async () => {
    let api!: ReturnType<typeof useLocalAudioRecorder>;
    act(() => {
      create(<Harness expose={(nextApi) => { api = nextApi; }} />);
    });

    let uri: string | null = null;
    await act(async () => {
      await api.prepare();
      await api.start();
      uri = await api.finalize();
      await api.play(uri as string);
    });

    expect(uri).toBe('file:///drop.m4a');
    expect(mockPlayer.replace).toHaveBeenCalledWith('file:///drop.m4a');
    expect(mockPlayer.seekTo).toHaveBeenCalledWith(0);
    expect(mockPlayer.play).toHaveBeenCalledTimes(1);
    expect(setAudioModeAsync).toHaveBeenCalledWith(EXPLICIT_PLAYBACK_AUDIO_MODE);
  });

  it('stops and releases retained playback before returning to the board', async () => {
    let api!: ReturnType<typeof useLocalAudioRecorder>;
    act(() => {
      create(<Harness expose={(nextApi) => { api = nextApi; }} />);
    });

    await act(async () => {
      await api.play('file:///drop.m4a');
      await api.stopPlayback();
    });

    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
    expect(mockPlayer.seekTo).toHaveBeenLastCalledWith(0);
    expect(mockPlayer.remove).toHaveBeenCalledTimes(1);
    expect(mockPlayer.replace).toHaveBeenCalledWith('file:///drop.m4a');
    expect(mockPlayer.replace).not.toHaveBeenCalledWith(null);
    expect(setAudioModeAsync).toHaveBeenCalledWith(EXPLICIT_PLAYBACK_AUDIO_MODE);
    expect(setAudioModeAsync).toHaveBeenLastCalledWith(AUTOMATIC_AUDIO_MODE);
  });

  it('does not block finalization when automatic-mode restoration fails', async () => {
    jest.mocked(setAudioModeAsync).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('mode restore failed'));
    let api!: ReturnType<typeof useLocalAudioRecorder>;
    act(() => {
      create(<Harness expose={(nextApi) => { api = nextApi; }} />);
    });

    let uri: string | null = null;
    await act(async () => {
      await api.prepare();
      await api.start();
      uri = await api.finalize();
    });

    expect(uri).toBe('file:///drop.m4a');
    expect(setAudioModeAsync).toHaveBeenLastCalledWith(AUTOMATIC_AUDIO_MODE);
  });

  it('stops retained playback before deleting the local file', async () => {
    let api!: ReturnType<typeof useLocalAudioRecorder>;
    act(() => {
      create(<Harness expose={(nextApi) => { api = nextApi; }} />);
    });

    await act(async () => {
      await api.play('file:///drop.m4a');
      await api.deleteRecording('file:///drop.m4a');
    });

    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
    expect(mockPlayer.remove).toHaveBeenCalledTimes(1);
    expect(mockPlayer.replace).not.toHaveBeenCalledWith(null);
    expect(mockDeleteFile).toHaveBeenCalledTimes(1);
    expect(mockPlayer.pause.mock.invocationCallOrder[0]).toBeLessThan(mockDeleteFile.mock.invocationCallOrder[0]);
  });

  it('preserves a retained file when playback cleanup fails', async () => {
    mockPlayer.remove.mockImplementationOnce(() => {
      throw new Error('native cleanup failed');
    });
    let api!: ReturnType<typeof useLocalAudioRecorder>;
    act(() => {
      create(<Harness expose={(nextApi) => { api = nextApi; }} />);
    });

    await act(async () => {
      await api.play('file:///drop.m4a');
      await expect(api.deleteRecording('file:///drop.m4a')).rejects.toThrow(
        'Unable to stop saved take playback. Your saved take is still available.',
      );
    });

    expect(mockDeleteFile).not.toHaveBeenCalled();
  });

  it('dedupes overlapping finalization and deletion during transient discard', async () => {
    let api!: ReturnType<typeof useLocalAudioRecorder>;
    act(() => {
      create(<Harness expose={(nextApi) => { api = nextApi; }} />);
    });

    await act(async () => {
      await api.prepare();
      await api.start();
      await Promise.all([api.discardTransientRecording(), api.discardTransientRecording()]);
    });

    expect(mockRecorder.stop).toHaveBeenCalledTimes(1);
    expect(mockDeleteFile).toHaveBeenCalledTimes(1);
  });

  it('does not finalize a prepared recorder that never started', async () => {
    let api!: ReturnType<typeof useLocalAudioRecorder>;
    act(() => {
      create(<Harness expose={(nextApi) => { api = nextApi; }} />);
    });

    await act(async () => {
      await api.prepare();
      await api.discardTransientRecording();
    });

    expect(mockRecorder.record).not.toHaveBeenCalled();
    expect(mockRecorder.stop).not.toHaveBeenCalled();
    expect(mockDeleteFile).not.toHaveBeenCalled();
  });

  it('revokes a replaced web recording exactly once after playback stops', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    mockRecorder.uri = 'blob:replaced';
    const revokeObjectURL = URL.revokeObjectURL as jest.Mock;
    let api!: ReturnType<typeof useLocalAudioRecorder>;
    act(() => {
      create(<Harness expose={(nextApi) => { api = nextApi; }} />);
    });

    await act(async () => {
      await api.play('blob:replaced');
      await api.deleteRecording('blob:replaced');
      await api.deleteRecording('blob:replaced');
    });

    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
    expect(mockPlayer.remove).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
    expect(mockPlayer.remove.mock.invocationCallOrder[0]).toBeLessThan(revokeObjectURL.mock.invocationCallOrder[0]);
  });

  it('keeps an active web playback URL when player cleanup fails, then revokes on retry', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    const revokeObjectURL = URL.revokeObjectURL as jest.Mock;
    let api!: ReturnType<typeof useLocalAudioRecorder>;
    act(() => {
      create(<Harness expose={(nextApi) => { api = nextApi; }} />);
    });

    await act(async () => {
      await api.play('blob:failed-cleanup');
      mockPlayer.remove.mockImplementationOnce(() => {
        throw new Error('native cleanup failed');
      });
      await expect(api.deleteRecording('blob:failed-cleanup')).rejects.toThrow(
        'Unable to stop saved take playback. Your saved take is still available.',
      );
    });

    expect(revokeObjectURL).not.toHaveBeenCalled();

    await act(async () => {
      await api.deleteRecording('blob:failed-cleanup');
    });

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:failed-cleanup');
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it('releases a retained web recording once on unmount after playback cleanup', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    mockRecorder.uri = 'blob:retained';
    const revokeObjectURL = URL.revokeObjectURL as jest.Mock;
    let api!: ReturnType<typeof useLocalAudioRecorder>;
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(<Harness expose={(nextApi) => { api = nextApi; }} />);
    });

    await act(async () => {
      await api.prepare();
      await api.start();
      const uri = await api.finalize();
      api.retainFinalizedRecording(uri as string);
      await api.play(uri as string);
    });
    await act(async () => {
      renderer.unmount();
      await Promise.resolve();
    });

    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);
    expect(mockPlayer.remove).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:retained');
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it('revokes an abandoned active web recording once on unmount', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
    mockRecorder.uri = 'blob:abandoned';
    const revokeObjectURL = URL.revokeObjectURL as jest.Mock;
    let api!: ReturnType<typeof useLocalAudioRecorder>;
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(<Harness expose={(nextApi) => { api = nextApi; }} />);
    });

    await act(async () => {
      await api.prepare();
      await api.start();
      renderer.unmount();
      await Promise.resolve();
    });

    expect(mockRecorder.stop).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:abandoned');
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it('retains a finalized completed file until explicit deletion', async () => {
    let api!: ReturnType<typeof useLocalAudioRecorder>;
    act(() => {
      create(<Harness expose={(nextApi) => { api = nextApi; }} />);
    });

    await act(async () => {
      await api.prepare();
      await api.start();
      const uri = await api.finalize();
      api.retainFinalizedRecording(uri as string);
      await api.discardTransientRecording();
      await api.deleteRecording(uri as string);
    });

    expect(mockDeleteFile).toHaveBeenCalledTimes(1);
  });
});
