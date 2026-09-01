import { describe, expect, jest, test } from '@jest/globals';

import {
  deletionConfirmed,
  selectExpiredRows,
  selectOrphanRows,
  verifyStorageDeletion,
} from '../../../supabase/functions/_shared/storage-deletion';

function storageFixture({
  removeData,
  removeError = null,
  listedNames = [],
  listError = null,
}: {
  removeData?: unknown;
  removeError?: unknown;
  listedNames?: string[];
  listError?: unknown;
} = {}) {
  return {
    remove: jest.fn(async () => ({ data: removeData, error: removeError })),
    list: jest.fn(async () => ({
      data: listedNames.map((name) => ({ name })),
      error: listError,
    })),
  };
}

describe('R0D-D2A Storage deletion verification', () => {
  test('exact requested path returned as deleted', async () => {
    const storage = storageFixture({ removeData: [{ name: 'quick-read/u/a/source.wav' }] });
    const result = await verifyStorageDeletion(storage, ['quick-read/u/a/source.wav']);

    expect(result.status).toBe('deleted');
    expect(result.paths[0]).toMatchObject({ status: 'deleted', retryable: false });
    expect(storage.list).not.toHaveBeenCalled();
  });

  test('already-absent object is confirmed as idempotent success', async () => {
    const storage = storageFixture({ removeData: [] });
    const result = await verifyStorageDeletion(storage, ['quick-read/u/a/source.wav']);

    expect(result.status).toBe('already_absent');
    expect(deletionConfirmed(result)).toBe(true);
  });

  test('empty deletion response while metadata still exists is failure', async () => {
    const storage = storageFixture({ removeData: [], listedNames: ['source.wav'] });
    const result = await verifyStorageDeletion(storage, ['quick-read/u/a/source.wav']);

    expect(result.status).toBe('failed');
    expect(deletionConfirmed(result)).toBe(false);
  });

  test('partial batch deletion reports each remaining path', async () => {
    const storage = storageFixture({
      removeData: [{ name: 'quick-read/u/a/source-a.wav' }],
      listedNames: ['source-b.wav'],
    });
    const result = await verifyStorageDeletion(storage, [
      'quick-read/u/a/source-a.wav',
      'quick-read/u/a/source-b.wav',
    ]);

    expect(result.status).toBe('partial');
    expect(result.paths).toEqual([
      expect.objectContaining({ path: 'quick-read/u/a/source-a.wav', status: 'deleted' }),
      expect.objectContaining({ path: 'quick-read/u/a/source-b.wav', status: 'failed', retryable: true }),
    ]);
  });

  test('ambiguous response remains retryable', async () => {
    const storage = storageFixture({ removeData: undefined, listError: new Error('metadata unavailable') });
    const result = await verifyStorageDeletion(storage, ['quick-read/u/a/source.wav']);

    expect(result.status).toBe('ambiguous');
    expect(result.paths[0]).toMatchObject({ status: 'ambiguous', retryable: true });
  });

  test('successful Quick Read cannot complete while audio is confirmed present', async () => {
    const storage = storageFixture({ removeData: [], listedNames: ['source.wav'] });
    const result = await verifyStorageDeletion(storage, ['quick-read/u/a/source.wav']);

    expect(deletionConfirmed(result)).toBe(false);
  });

  test('successful Quick Read can complete when audio is confirmed absent', async () => {
    const storage = storageFixture({ removeData: [] });
    const result = await verifyStorageDeletion(storage, ['quick-read/u/a/source.wav']);

    expect(deletionConfirmed(result)).toBe(true);
  });
});

describe('R0D-D2A bounded cleanup selection', () => {
  const now = '2026-08-17T20:00:00.000Z';

  test('expired audio batches stop at 50', () => {
    const rows = Array.from({ length: 55 }, (_, index) => ({
      id: String(index).padStart(2, '0'),
      expiresAt: '2026-08-17T19:00:00.000Z',
    }));
    expect(selectExpiredRows(rows, now)).toHaveLength(50);
  });

  test('transcript batches stop at 50', () => {
    const rows = Array.from({ length: 55 }, (_, index) => ({
      id: String(index).padStart(2, '0'),
      expiresAt: '2026-08-17T19:00:00.000Z',
    }));
    expect(selectExpiredRows(rows, now)).toHaveLength(50);
  });

  test('orphan batches stop at 50', () => {
    const rows = Array.from({ length: 55 }, (_, index) => ({
      createdAt: '2026-08-17T19:00:00.000Z',
      path: String(index).padStart(2, '0'),
    }));
    expect(selectOrphanRows(rows)).toHaveLength(50);
  });

  test('stable ordering prevents starvation', () => {
    const rows = [
      { id: 'b', expiresAt: '2026-08-17T19:00:00.000Z' },
      { id: 'a', expiresAt: '2026-08-17T19:00:00.000Z' },
      { id: 'c', expiresAt: '2026-08-17T18:00:00.000Z' },
    ];
    expect(selectExpiredRows(rows, now).map(({ id }) => id)).toEqual(['c', 'a', 'b']);
  });

  test('non-expired content is never selected', () => {
    const rows = [
      { id: 'expired', expiresAt: '2026-08-17T19:00:00.000Z' },
      { id: 'future', expiresAt: '2026-08-17T21:00:00.000Z' },
    ];
    expect(selectExpiredRows(rows, now).map(({ id }) => id)).toEqual(['expired']);
  });

  test('storage deletion errors remain retryable', async () => {
    const storage = storageFixture({ removeError: new Error('storage unavailable') });
    const result = await verifyStorageDeletion(storage, ['quick-read/u/a/source.wav']);

    expect(result.status).toBe('failed');
    expect(result.paths).toEqual([
      expect.objectContaining({
        path: 'quick-read/u/a/source.wav',
        status: 'failed',
        retryable: true,
      }),
    ]);
  });

  test('repeated cleanup is idempotent for already-absent objects', async () => {
    const storage = storageFixture({ removeData: [] });
    const first = await verifyStorageDeletion(storage, ['quick-read/u/a/source.wav']);
    const second = await verifyStorageDeletion(storage, ['quick-read/u/a/source.wav']);

    expect(deletionConfirmed(first)).toBe(true);
    expect(deletionConfirmed(second)).toBe(true);
  });

  test('concurrent cleanup remains safe when both calls confirm absence', async () => {
    const storage = storageFixture({ removeData: [] });
    const results = await Promise.all([
      verifyStorageDeletion(storage, ['quick-read/u/a/source.wav']),
      verifyStorageDeletion(storage, ['quick-read/u/a/source.wav']),
    ]);

    expect(results.every(deletionConfirmed)).toBe(true);
  });
});
