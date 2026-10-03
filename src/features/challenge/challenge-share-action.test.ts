import React from 'react';
import { describe, expect, it, jest } from '@jest/globals';
import { act, create } from 'react-test-renderer';

import { ChallengeShareAction } from './ChallengeShareAction';
import { createAndShareChallenge, isChallengeShareEligible, type ChallengeShareInput } from './challenge-share-action';

const input: ChallengeShareInput = {
  attemptId: 'attempt-1',
  category: 'Debate',
  durationSeconds: 30,
  prompt: 'What changed your mind?',
};

function renderAction(overrides: Partial<React.ComponentProps<typeof ChallengeShareAction>> = {}) {
  let tree: ReturnType<typeof create>;
  act(() => {
    tree = create(React.createElement(
      ChallengeShareAction,
      {
        eligible: true,
        onError: jest.fn(),
        onShare: async () => undefined,
        ...overrides,
      },
    ));
  });
  return tree!;
}

describe('ChallengeShareAction', () => {
  it('appears only for an authenticated, persisted, complete Saved Drop', () => {
    expect(isChallengeShareEligible({
      authenticatedUserId: 'owner-1',
      category: 'Debate',
      durationSeconds: 30,
      localUriMatches: true,
      persisted: true,
      prompt: input.prompt,
      recordingCompleted: true,
      recordingUri: 'file:///drop.m4a',
      savedDropOwnerId: 'owner-1',
    })).toBe(true);
    expect(isChallengeShareEligible({
      authenticatedUserId: null,
      category: 'Debate',
      durationSeconds: 30,
      localUriMatches: true,
      persisted: true,
      prompt: input.prompt,
      recordingCompleted: true,
      recordingUri: 'file:///drop.m4a',
      savedDropOwnerId: 'owner-1',
    })).toBe(false);
    expect(isChallengeShareEligible({
      authenticatedUserId: 'owner-1',
      category: null,
      durationSeconds: 30,
      localUriMatches: true,
      persisted: false,
      prompt: input.prompt,
      recordingCompleted: true,
      recordingUri: 'file:///drop.m4a',
      savedDropOwnerId: 'owner-1',
    })).toBe(false);

    const tree = renderAction({ eligible: true });
    expect(tree.root.findByProps({ testID: 'share-challenge-button' }).props.label).toBe('Share a Challenge');
    expect(tree.root.findByProps({ accessibilityLabel: 'Share a Challenge' }).props.accessibilityRole).toBe('button');
  });

  it('does not render for an ineligible Saved Drop', () => {
    const tree = renderAction({ eligible: false });
    expect(tree.root.findAllByProps({ testID: 'share-challenge-button' })).toHaveLength(0);
  });

  it('creates one challenge for rapid repeated presses', async () => {
    let release!: () => void;
    const onShare = jest.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const tree = renderAction({ onShare });
    const button = tree.root.findByProps({ testID: 'share-challenge-button' });

    await act(async () => {
      const first = button.props.onPress();
      const second = button.props.onPress();
      expect(onShare).toHaveBeenCalledTimes(1);
      release();
      await Promise.all([first, second]);
    });
  });

  it('reports creation failure without a second attempt', async () => {
    const onError = jest.fn();
    const onShare = jest.fn(async () => { throw new Error('create failed'); });
    const tree = renderAction({ onError, onShare });

    await act(async () => {
      await tree.root.findByProps({ testID: 'share-challenge-button' }).props.onPress();
    });

    expect(onShare).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith('create failed');
  });

  it('keeps the share-sheet result isolated and does not retry cancellation', async () => {
    const onShare = jest.fn(async () => undefined);
    const tree = renderAction({ onShare });

    await act(async () => {
      await tree.root.findByProps({ testID: 'share-challenge-button' }).props.onPress();
    });

    expect(onShare).toHaveBeenCalledTimes(1);
  });
});

describe('createAndShareChallenge', () => {
  it('passes only public challenge fields to creation and sharing', async () => {
    const createChallenge = jest.fn(async (value: ChallengeShareInput) => {
      expect(value).toEqual(input);
      return { url: 'https://thedropmic.com/challenge/opaque-token' };
    });
    const shareDropCard = jest.fn(async (value: { prompt: string; challengeUrl: string }) => {
      expect(value).toEqual({ challengeUrl: 'https://thedropmic.com/challenge/opaque-token', prompt: input.prompt });
    });

    await createAndShareChallenge(input, { createChallenge, shareDropCard });

    expect(Object.keys(createChallenge.mock.calls[0][0])).toEqual(['attemptId', 'category', 'durationSeconds', 'prompt']);
    expect(Object.keys(shareDropCard.mock.calls[0][0])).toEqual(['prompt', 'challengeUrl']);
    expect(JSON.stringify(createChallenge.mock.calls[0][0])).not.toMatch(/audio|transcript|storage|owner|email|provider|metric/iu);
  });

  it('does not open the share sheet when creation fails', async () => {
    const createChallenge = jest.fn(async () => { throw new Error('create failed'); });
    const shareDropCard = jest.fn(async () => undefined);

    await expect(createAndShareChallenge(input, { createChallenge, shareDropCard })).rejects.toThrow('create failed');
    expect(shareDropCard).not.toHaveBeenCalled();
  });
});
