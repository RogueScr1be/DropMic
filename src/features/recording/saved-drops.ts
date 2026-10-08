import AsyncStorage from '@react-native-async-storage/async-storage';
import { File, Paths } from 'expo-file-system';

import {
  LOCAL_COMPLETED_TAKE_KEY,
  localCompletedTakeFileExists,
  type LocalCompletedTake,
} from './local-completed-take';

export const SAVED_DROPS_KEY = '@micdrop/launch/saved-drops';
export const SAVED_DROPS_VERSION = 1 as const;
export const FREE_SAVED_DROP_LIMIT = 3;

export type SavedDrop = LocalCompletedTake & {
  savedDropId: string;
};

type FileExists = (uri: string) => boolean | Promise<boolean>;
type RecordingUriResolver = (fileName: string) => string;

const RECORDING_DIRECTORY = 'ExpoAudio';
const SAFE_RECORDING_FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.m4a$/i;

function defaultRecordingUriResolver(fileName: string) {
  return new File(Paths.document, RECORDING_DIRECTORY, fileName).uri;
}

function fileNameFromStoredUri(uri: string) {
  if (uri.startsWith('blob:')) {
    return null;
  }

  const candidate = uri.startsWith('file://')
    ? (() => {
      try {
        const parsed = new URL(uri);
        if (parsed.protocol !== 'file:' || parsed.host || parsed.search || parsed.hash) {
          return '';
        }
        const pathname = decodeURIComponent(parsed.pathname);
        const segments = pathname.split('/');
        if (segments.includes('.') || segments.includes('..')) {
          return '';
        }
        return segments.at(-1) ?? '';
      } catch {
        return '';
      }
    })()
    : uri.includes('/') || uri.includes('\\')
      ? ''
      : uri;

  return SAFE_RECORDING_FILE_NAME.test(candidate) ? candidate : null;
}

function persistedRecordingUri(uri: string) {
  if (uri.startsWith('blob:')) {
    return uri;
  }
  return fileNameFromStoredUri(uri);
}

async function hydrateDrop(
  drop: SavedDrop,
  fileExists: FileExists,
  resolveRecordingUri: RecordingUriResolver,
) {
  const resolvedUri = drop.localUri.startsWith('blob:')
    ? drop.localUri
    : fileNameFromStoredUri(drop.localUri)
      ? resolveRecordingUri(fileNameFromStoredUri(drop.localUri) as string)
      : null;
  if (!resolvedUri || !(await Promise.resolve(fileExists(resolvedUri)))) {
    return null;
  }
  return { ...drop, localUri: resolvedUri };
}

export class SavedDropLimitError extends Error {
  constructor(limit = FREE_SAVED_DROP_LIMIT) {
    super(`Free accounts can keep ${limit} Saved Drops. Upgrade to Plus to keep more.`);
    this.name = 'SavedDropLimitError';
  }
}

function parseSavedDrops(raw: string | null): SavedDrop[] {
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isSavedDrop);
  } catch {
    return [];
  }
}

function isSavedDrop(value: unknown): value is SavedDrop {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const drop = value as Partial<SavedDrop>;
  return (
    typeof drop.savedDropId === 'string' &&
    drop.savedDropId.trim().length > 0 &&
    drop.version === 1 &&
    typeof drop.clientAttemptId === 'string' &&
    typeof drop.quickReadIdempotencyKey === 'string' &&
    typeof drop.ownerId === 'string' &&
    typeof drop.localUri === 'string' &&
    typeof drop.topicId === 'string' &&
    typeof drop.prompt === 'string' &&
    (drop.category === undefined || typeof drop.category === 'string') &&
    (drop.selectedDurationSeconds === 30 || drop.selectedDurationSeconds === 60 || drop.selectedDurationSeconds === 90) &&
    typeof drop.completedDurationSeconds === 'number' &&
    Number.isFinite(drop.completedDurationSeconds) &&
    typeof drop.completedAt === 'string' &&
    Number.isFinite(Date.parse(drop.completedAt))
  );
}

function newestFirst(left: SavedDrop, right: SavedDrop) {
  return Date.parse(right.completedAt) - Date.parse(left.completedAt);
}

function sameDrop(left: SavedDrop, right: SavedDrop) {
  return (
    left.savedDropId === right.savedDropId &&
    left.clientAttemptId === right.clientAttemptId &&
    left.completedAt === right.completedAt &&
    persistedRecordingUri(left.localUri) === persistedRecordingUri(right.localUri) &&
    left.ownerId === right.ownerId &&
    left.prompt === right.prompt &&
    left.category === right.category &&
    left.quickReadIdempotencyKey === right.quickReadIdempotencyKey &&
    left.selectedDurationSeconds === right.selectedDurationSeconds &&
    left.completedDurationSeconds === right.completedDurationSeconds &&
    left.topicId === right.topicId
  );
}

async function readAll(
  fileExists: FileExists | undefined,
  resolveRecordingUri: RecordingUriResolver = defaultRecordingUriResolver,
): Promise<SavedDrop[]> {
  const stored = parseSavedDrops(await AsyncStorage.getItem(SAVED_DROPS_KEY));
  const owners = new Map<string, SavedDrop[]>();
  const normalizedStored: SavedDrop[] = [];
  const available: SavedDrop[] = [];
  for (const drop of stored) {
    const hydrated = await hydrateDrop(drop, fileExists ?? localCompletedTakeFileExists, resolveRecordingUri);
    if (!hydrated) {
      normalizedStored.push(drop);
      const ownerDrops = owners.get(drop.ownerId) ?? [];
      ownerDrops.push(drop);
      owners.set(drop.ownerId, ownerDrops);
      continue;
    }
    normalizedStored.push(persistDropForStorage(hydrated));
    available.push(hydrated);
    const ownerDrops = owners.get(drop.ownerId) ?? [];
    ownerDrops.push(hydrated);
    owners.set(drop.ownerId, ownerDrops);
  }
  if (JSON.stringify(normalizedStored) !== JSON.stringify(stored)) {
    await AsyncStorage.setItem(SAVED_DROPS_KEY, JSON.stringify(normalizedStored));
  }

  // The previous launch stored one record under the legacy key. Migrate it
  // into the array only after the file still exists and the owner matches.
  const legacyRaw = await AsyncStorage.getItem(LOCAL_COMPLETED_TAKE_KEY);
  const legacy = legacyRaw
    ? await parseLegacyTake(legacyRaw, fileExists, resolveRecordingUri)
    : null;
  if (legacy) {
    const migrated: SavedDrop = { ...legacy, savedDropId: legacy.clientAttemptId };
    const ownerDrops = owners.get(migrated.ownerId) ?? [];
    if (!ownerDrops.some((drop) => drop.savedDropId === migrated.savedDropId)) {
      ownerDrops.push(migrated);
      owners.set(migrated.ownerId, ownerDrops);
      available.push(migrated);
      await AsyncStorage.setItem(SAVED_DROPS_KEY, JSON.stringify([...owners.values()].flat().map(persistDropForStorage)));
    }
  }

  return available.sort(newestFirst);
}

async function parseLegacyTake(
  raw: string,
  fileExists: FileExists | undefined,
  resolveRecordingUri: RecordingUriResolver,
): Promise<LocalCompletedTake | null> {
  try {
    const parsed = JSON.parse(raw) as Partial<LocalCompletedTake>;
    if (
      parsed.version !== 1 ||
      typeof parsed.clientAttemptId !== 'string' ||
      typeof parsed.quickReadIdempotencyKey !== 'string' ||
      typeof parsed.ownerId !== 'string' ||
      parsed.ownerId.trim() === '' ||
      typeof parsed.localUri !== 'string' ||
      typeof parsed.topicId !== 'string' ||
      typeof parsed.prompt !== 'string' ||
      ![30, 60, 90].includes(parsed.selectedDurationSeconds as number) ||
      typeof parsed.completedDurationSeconds !== 'number' ||
      !Number.isFinite(parsed.completedDurationSeconds) ||
      typeof parsed.completedAt !== 'string' ||
      !Number.isFinite(Date.parse(parsed.completedAt))
    ) {
      return null;
    }
    const hydrated = await hydrateDrop(
      { ...parsed, savedDropId: parsed.clientAttemptId } as SavedDrop,
      fileExists ?? localCompletedTakeFileExists,
      resolveRecordingUri,
    );
    return hydrated ? hydrated : null;
  } catch {
    return null;
  }
}

export async function getSavedDrops(
  ownerId: string | null,
  options: { fileExists?: FileExists; resolveRecordingUri?: RecordingUriResolver } = {},
): Promise<SavedDrop[]> {
  if (!ownerId) {
    return [];
  }
  return (await readAll(options.fileExists, options.resolveRecordingUri)).filter((drop) => drop.ownerId === ownerId);
}

function persistDropForStorage(drop: SavedDrop): SavedDrop {
  const storedUri = persistedRecordingUri(drop.localUri);
  return storedUri ? { ...drop, localUri: storedUri } : drop;
}

export async function saveAndVerifySavedDrop(
  drop: SavedDrop,
  options: { fileExists?: FileExists; plus?: boolean; limit?: number; resolveRecordingUri?: RecordingUriResolver } = {},
) {
  const fileExists = options.fileExists ?? localCompletedTakeFileExists;
  if (!(await Promise.resolve(fileExists(drop.localUri)))) {
    throw new Error('The completed recording file is not available to save.');
  }

  if (!persistedRecordingUri(drop.localUri)) {
    throw new Error('The completed recording path is not a supported local audio file.');
  }

  const stored = await readAll(fileExists, options.resolveRecordingUri);
  const existingIndex = stored.findIndex((item) => item.savedDropId === drop.savedDropId && item.ownerId === drop.ownerId);
  const ownerCount = stored.filter((item) => item.ownerId === drop.ownerId).length;
  const limit = options.limit ?? FREE_SAVED_DROP_LIMIT;
  if (existingIndex < 0 && !options.plus && ownerCount >= limit) {
    throw new SavedDropLimitError(limit);
  }

  const next = existingIndex >= 0
    ? stored.map((item, index) => (index === existingIndex ? drop : item)).map(persistDropForStorage)
    : [...stored, drop].map(persistDropForStorage);
  await AsyncStorage.setItem(SAVED_DROPS_KEY, JSON.stringify(next));
  const verified = (await getSavedDrops(drop.ownerId, {
    fileExists,
    resolveRecordingUri: options.resolveRecordingUri,
  })).find((item) => item.savedDropId === drop.savedDropId);
  if (!verified || !sameDrop(verified, drop)) {
    throw new Error('The Saved Drop could not be verified after saving.');
  }
  return verified;
}

export async function deleteSavedDrop(savedDropId: string, ownerId: string) {
  const stored = parseSavedDrops(await AsyncStorage.getItem(SAVED_DROPS_KEY));
  await AsyncStorage.setItem(
    SAVED_DROPS_KEY,
    JSON.stringify(stored.filter((drop) => !(drop.savedDropId === savedDropId && drop.ownerId === ownerId))),
  );
  const legacyRaw = await AsyncStorage.getItem(LOCAL_COMPLETED_TAKE_KEY);
  if (legacyRaw) {
    try {
      const legacy = JSON.parse(legacyRaw) as Partial<LocalCompletedTake>;
      if (legacy.clientAttemptId === savedDropId && legacy.ownerId === ownerId) {
        await AsyncStorage.removeItem(LOCAL_COMPLETED_TAKE_KEY);
      }
    } catch {
      // A malformed legacy record is already ignored by the migration path.
    }
  }
}

export async function clearSavedDrops() {
  await AsyncStorage.removeItem(SAVED_DROPS_KEY);
}
