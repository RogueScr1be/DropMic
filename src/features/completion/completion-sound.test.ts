import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { setAudioModeAsync } from 'expo-audio';

import { AUTOMATIC_AUDIO_MODE } from '@/features/audio/audio-mode';
import { createCompletionBellController } from './completion-sound';

jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  setIsAudioActiveAsync: jest.fn(() => Promise.resolve()),
  useAudioPlayer: jest.fn(),
}));

function createPlayer() {
  return {
    pause: jest.fn(),
    play: jest.fn(),
    remove: jest.fn(),
    seekTo: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
  };
}

describe('completion bell', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('configures automatic audio before the default bell playback', async () => {
    const player = createPlayer();
    const controller = createCompletionBellController(player);

    await expect(controller.playOnce('attempt-automatic-mode')).resolves.toBe(true);

    expect(setAudioModeAsync).toHaveBeenCalledWith(AUTOMATIC_AUDIO_MODE);
    expect((setAudioModeAsync as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      player.play.mock.invocationCallOrder[0],
    );
  });

  it('plays once for a newly persisted attempt and ignores duplicate callbacks', async () => {
    const player = createPlayer();
    const prepareAudioMode = jest.fn<() => Promise<void>>().mockResolvedValue(undefined);
    const controller = createCompletionBellController(player, prepareAudioMode);

    await expect(controller.playOnce('attempt-1')).resolves.toBe(true);
    await expect(controller.playOnce('attempt-1')).resolves.toBe(false);

    expect(prepareAudioMode).toHaveBeenCalledTimes(1);
    expect(player.seekTo).toHaveBeenCalledWith(0);
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it('does not replay for a rerender or recovered/reopened attempt, but plays a new attempt once', async () => {
    const player = createPlayer();
    const controller = createCompletionBellController(player, jest.fn<() => Promise<void>>().mockResolvedValue(undefined));

    await controller.playOnce('attempt-1');
    await controller.playOnce('attempt-1');
    await controller.playOnce('attempt-2');
    await controller.playOnce('attempt-2');

    expect(player.play).toHaveBeenCalledTimes(2);
  });

  it('keeps bell audio isolated from retained Drop playback', async () => {
    const bellPlayer = createPlayer();
    const retainedPlayer = createPlayer();
    const controller = createCompletionBellController(bellPlayer, jest.fn<() => Promise<void>>().mockResolvedValue(undefined));

    await controller.playOnce('attempt-1');

    expect(bellPlayer.play).toHaveBeenCalledTimes(1);
    expect(retainedPlayer.play).not.toHaveBeenCalled();
    expect(retainedPlayer.pause).not.toHaveBeenCalled();
  });

  it('does not block completion when audio-mode or bell playback fails', async () => {
    const player = createPlayer();
    player.seekTo.mockRejectedValueOnce(new Error('bell unavailable'));
    const controller = createCompletionBellController(player, jest.fn<() => Promise<void>>().mockRejectedValue(new Error('audio mode unavailable')));

    await expect(controller.playOnce('attempt-1')).resolves.toBe(false);
    expect(player.play).not.toHaveBeenCalled();
  });

  it('cleans up safely and never plays after disposal', async () => {
    const player = createPlayer();
    const controller = createCompletionBellController(player, jest.fn<() => Promise<void>>().mockResolvedValue(undefined));

    controller.cleanup();
    controller.cleanup();

    await expect(controller.playOnce('attempt-1')).resolves.toBe(false);
    expect(player.pause).toHaveBeenCalledTimes(1);
    expect(player.remove).toHaveBeenCalledTimes(1);
    expect(player.play).not.toHaveBeenCalled();
  });

  it('swallows cleanup failures', () => {
    const player = createPlayer();
    player.pause.mockImplementationOnce(() => { throw new Error('pause failed'); });
    player.remove.mockImplementationOnce(() => { throw new Error('remove failed'); });
    const controller = createCompletionBellController(player);

    expect(() => controller.cleanup()).not.toThrow();
  });
});
