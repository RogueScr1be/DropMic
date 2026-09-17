import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { setAudioModeAsync, useAudioPlayer } from 'expo-audio';

import { AUTOMATIC_AUDIO_MODE } from '@/features/audio/audio-mode';
import { useClackSound } from './solari-sound';

jest.mock('expo-audio', () => ({
  setAudioModeAsync: jest.fn(() => Promise.resolve()),
  setIsAudioActiveAsync: jest.fn(() => Promise.resolve()),
  useAudioPlayer: jest.fn(),
}));

const player = {
  pause: jest.fn(),
  play: jest.fn(),
  seekTo: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
};

function Harness({ expose }: { expose: (play: () => void) => void }) {
  expose(useClackSound(true));
  return null;
}

describe('Solari audio mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useAudioPlayer as jest.Mock).mockReturnValue(player);
  });

  it('configures automatic audio before clack playback', async () => {
    let playClack!: () => void;
    let renderer!: ReturnType<typeof create>;
    act(() => {
      renderer = create(<Harness expose={(nextPlay) => { playClack = nextPlay; }} />);
    });
    await act(async () => {
      playClack();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(setAudioModeAsync).toHaveBeenCalledWith(AUTOMATIC_AUDIO_MODE);
    expect((setAudioModeAsync as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
      player.play.mock.invocationCallOrder[0],
    );

    act(() => renderer.unmount());
  });
});
