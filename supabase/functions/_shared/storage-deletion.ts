export type StorageDeletionStatus =
  | 'deleted'
  | 'already_absent'
  | 'partial'
  | 'ambiguous'
  | 'failed';

export type StorageDeletionPathResult = {
  path: string;
  status: Exclude<StorageDeletionStatus, 'partial'>;
  retryable: boolean;
};

export type StorageDeletionResult = {
  status: StorageDeletionStatus;
  paths: StorageDeletionPathResult[];
};

export function deletionConfirmed(result: StorageDeletionResult) {
  return result.paths.every(({ status }) => status === 'deleted' || status === 'already_absent');
}

type StorageApi = {
  remove(paths: string[]): Promise<{ data: unknown; error: unknown }>;
  list(
    folder: string,
    options?: { limit?: number; search?: string },
  ): Promise<{ data: unknown; error: unknown }>;
};

function returnedPath(entry: unknown) {
  if (typeof entry === 'string') return entry;
  if (!entry || typeof entry !== 'object') return null;
  const candidate = entry as { name?: unknown; path?: unknown };
  if (typeof candidate.path === 'string') return candidate.path;
  if (typeof candidate.name === 'string') return candidate.name;
  return null;
}

function pathParts(path: string) {
  const separator = path.lastIndexOf('/');
  return {
    folder: separator === -1 ? '' : path.slice(0, separator),
    name: separator === -1 ? path : path.slice(separator + 1),
  };
}

async function confirmAbsent(storage: StorageApi, path: string): Promise<'already_absent' | 'failed' | 'ambiguous'> {
  const { folder, name } = pathParts(path);
  const { data, error } = await storage.list(folder, { limit: 100, search: name });
  if (error || !Array.isArray(data)) return 'ambiguous';

  const present = data.some((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const listedName = (entry as { name?: unknown }).name;
    return listedName === name;
  });
  return present ? 'failed' : 'already_absent';
}

function overallStatus(paths: StorageDeletionPathResult[]): StorageDeletionStatus {
  const successful = paths.filter(({ status }) => status === 'deleted' || status === 'already_absent').length;
  const failures = paths.filter(({ status }) => status === 'failed').length;
  const ambiguous = paths.filter(({ status }) => status === 'ambiguous').length;

  if (failures === 0 && ambiguous === 0) {
    return successful === paths.length && paths.every(({ status }) => status === 'already_absent')
      ? 'already_absent'
      : 'deleted';
  }
  if (successful > 0) return 'partial';
  if (failures > 0 && ambiguous === 0) return 'failed';
  return 'ambiguous';
}

/**
 * Removes exact Storage paths and verifies any path not named by the SDK response
 * through metadata-only listing. The returned paths must not be logged.
 */
export async function verifyStorageDeletion(storage: StorageApi, paths: string[]): Promise<StorageDeletionResult> {
  const requested = [...new Set(paths)];
  if (requested.length === 0) return { status: 'already_absent', paths: [] };

  const response = await storage.remove(requested);
  const returned = Array.isArray(response.data)
    ? new Set(response.data.map(returnedPath).filter((path): path is string => path !== null))
    : null;

  const results: StorageDeletionPathResult[] = [];
  for (const path of requested) {
    if (response.error) {
      results.push({ path, status: 'failed', retryable: true });
      continue;
    }

    if (returned?.has(path)) {
      results.push({ path, status: 'deleted', retryable: false });
      continue;
    }

    const status = await confirmAbsent(storage, path);
    results.push({ path, status, retryable: status !== 'already_absent' });
  }

  return { status: overallStatus(results), paths: results };
}

export type CleanupOrderedRow = {
  id: string;
  expiresAt: string;
};

export function selectExpiredRows<T extends CleanupOrderedRow>(rows: T[], now: string, limit = 50) {
  return rows
    .filter((row) => row.expiresAt <= now)
    .sort((left, right) => left.expiresAt.localeCompare(right.expiresAt) || left.id.localeCompare(right.id))
    .slice(0, limit);
}

export type OrphanStorageRow = {
  createdAt: string;
  path: string;
};

export function selectOrphanRows(rows: OrphanStorageRow[], limit = 50) {
  return rows
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.path.localeCompare(right.path))
    .slice(0, limit);
}
