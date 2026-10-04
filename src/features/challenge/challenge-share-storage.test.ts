import { beforeEach, describe, expect, it } from '@jest/globals';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  clearChallengeShareLink,
  getChallengeShareLink,
  isValidChallengeUrl,
  saveChallengeShareLink,
} from './challenge-share-storage';

const record = {
  version: 1 as const,
  ownerId: 'owner-1',
  attemptId: 'attempt-1',
  challengeId: 'challenge-1',
  url: 'https://thedropmic.com/challenge/abcdef0123456789abcdef0123456789',
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
};

describe('challenge share storage', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('validates only canonical HTTPS challenge URLs', () => {
    expect(isValidChallengeUrl(record.url)).toBe(true);
    for (const value of [
      'http://thedropmic.com/challenge/token-token-token-token',
      'https://www.thedropmic.com/challenge/token-token-token-token',
      'https://thedropmic.com/challenge/token-token-token-token?next=private',
      'https://thedropmic.com/challenge/token-token-token-token#fragment',
      'https://thedropmic.com/challenge/one/two',
      'https://user:pass@thedropmic.com/challenge/token-token-token-token',
      'https://thedropmic.com/challenge/short',
    ]) {
      expect(isValidChallengeUrl(value)).toBe(false);
    }
  });

  it('stores and returns links only for their owner and attempt', async () => {
    await saveChallengeShareLink(record);

    await expect(getChallengeShareLink('owner-1', 'attempt-1')).resolves.toEqual(record);
    await expect(getChallengeShareLink('owner-2', 'attempt-1')).resolves.toBeNull();
    await expect(getChallengeShareLink('owner-1', 'attempt-2')).resolves.toBeNull();
  });

  it('replaces only the same owner and attempt record', async () => {
    await saveChallengeShareLink(record);
    const replacement = { ...record, url: 'https://thedropmic.com/challenge/1234567890abcdef1234567890abcdef' };
    await saveChallengeShareLink(replacement);

    await expect(getChallengeShareLink(record.ownerId, record.attemptId)).resolves.toEqual(replacement);
    const raw = await AsyncStorage.getItem('@micdrop/launch/challenge-share-links');
    expect(JSON.parse(raw as string)).toHaveLength(1);
  });

  it('clears expired links without deleting unrelated owner records', async () => {
    const expired = { ...record, attemptId: 'attempt-expired', expiresAt: new Date(Date.now() - 60_000).toISOString() };
    await AsyncStorage.setItem('@micdrop/launch/challenge-share-links', JSON.stringify([record, expired]));

    await expect(getChallengeShareLink(record.ownerId, expired.attemptId)).resolves.toBeNull();
    await expect(getChallengeShareLink(record.ownerId, record.attemptId)).resolves.toEqual(record);
  });

  it('clears one owner-scoped record explicitly', async () => {
    await saveChallengeShareLink(record);
    await clearChallengeShareLink(record.ownerId, record.attemptId);

    await expect(getChallengeShareLink(record.ownerId, record.attemptId)).resolves.toBeNull();
  });
});
