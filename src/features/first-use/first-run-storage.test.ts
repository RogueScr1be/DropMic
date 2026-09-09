import { describe, expect, it, jest } from '@jest/globals';

import {
  AGE_GATE_STORAGE_KEY,
  AGE_GATE_VERSION,
  hasAcceptedAgeGate,
  saveAgeGateAcceptance,
} from './first-run-storage';

describe('first-run age-gate storage', () => {
  it('persists and recognizes a versioned age-gate receipt', async () => {
    let value: string | null = null;
    const storage = {
      getItem: jest.fn(async () => value),
      setItem: jest.fn(async (_key: string, next: string) => { value = next; }),
    };

    await saveAgeGateAcceptance(storage, new Date('2026-09-08T12:00:00.000Z'));

    expect(storage.setItem).toHaveBeenCalledWith(AGE_GATE_STORAGE_KEY, JSON.stringify({
      confirmedAt: '2026-09-08T12:00:00.000Z',
      version: AGE_GATE_VERSION,
    }));
    await expect(hasAcceptedAgeGate(storage)).resolves.toBe(true);
  });

  it('fails closed for missing, malformed, stale, and unreadable state', async () => {
    await expect(hasAcceptedAgeGate({ getItem: async () => null, setItem: async () => undefined })).resolves.toBe(false);
    await expect(hasAcceptedAgeGate({ getItem: async () => '{bad', setItem: async () => undefined })).resolves.toBe(false);
    await expect(hasAcceptedAgeGate({ getItem: async () => JSON.stringify({ confirmedAt: new Date().toISOString(), version: 0 }), setItem: async () => undefined })).resolves.toBe(false);
    await expect(hasAcceptedAgeGate({ getItem: async () => { throw new Error('unavailable'); }, setItem: async () => undefined })).resolves.toBe(false);
  });

  it('surfaces write failure so the age gate cannot be bypassed', async () => {
    await expect(saveAgeGateAcceptance({
      getItem: async () => null,
      setItem: async () => { throw new Error('full'); },
    })).rejects.toThrow('full');
  });
});
