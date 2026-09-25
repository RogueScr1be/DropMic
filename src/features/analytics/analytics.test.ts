import AsyncStorage from '@react-native-async-storage/async-storage';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import { ANALYTICS_KEY, getTrackedEvents, trackEvent } from './analytics';

describe('privacy-safe analytics', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('deduplicates by business event key', async () => {
    await expect(trackEvent('recording_completed', { dedupeKey: 'take-1' })).resolves.toBe(true);
    await expect(trackEvent('recording_completed', { dedupeKey: 'take-1' })).resolves.toBe(false);
    await expect(getTrackedEvents()).resolves.toHaveLength(1);
  });

  it('stores only the safe event envelope', async () => {
    await trackEvent('quick_read_failed', { dedupeKey: 'run-1' });
    const raw = await AsyncStorage.getItem(ANALYTICS_KEY);
    expect(raw).not.toContain('transcript');
    expect(raw).not.toContain('recording');
    expect(raw).toContain('quick_read_failed');
  });

  it('does not persist sensitive dedupe keys and never throws when storage fails', async () => {
    await expect(trackEvent('challenge_link_opened', { dedupeKey: 'challenge-opened:' + 'a'.repeat(64) })).resolves.toBe(true);
    await expect(getTrackedEvents()).resolves.toEqual([expect.objectContaining({ name: 'challenge_link_opened' })]);
    const setItem = jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('storage unavailable'));
    await expect(trackEvent('recording_completed')).resolves.toBe(false);
    setItem.mockRestore();
  });
});
