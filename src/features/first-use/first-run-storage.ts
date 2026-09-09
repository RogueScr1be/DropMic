import AsyncStorage from '@react-native-async-storage/async-storage';

export const AGE_GATE_STORAGE_KEY = '@dropmic/ui-d1/age-gate';
export const AGE_GATE_VERSION = 1;

type Storage = Pick<typeof AsyncStorage, 'getItem' | 'setItem'>;

type AgeGateReceipt = {
  confirmedAt: string;
  version: typeof AGE_GATE_VERSION;
};

function isReceipt(value: unknown): value is AgeGateReceipt {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const receipt = value as Partial<AgeGateReceipt>;
  return receipt.version === AGE_GATE_VERSION &&
    typeof receipt.confirmedAt === 'string' &&
    Number.isFinite(Date.parse(receipt.confirmedAt));
}

export async function hasAcceptedAgeGate(storage: Storage = AsyncStorage): Promise<boolean> {
  try {
    const raw = await storage.getItem(AGE_GATE_STORAGE_KEY);
    return raw ? isReceipt(JSON.parse(raw)) : false;
  } catch {
    return false;
  }
}

export async function saveAgeGateAcceptance(
  storage: Storage = AsyncStorage,
  confirmedAt = new Date(),
): Promise<void> {
  const receipt: AgeGateReceipt = {
    confirmedAt: confirmedAt.toISOString(),
    version: AGE_GATE_VERSION,
  };
  await storage.setItem(AGE_GATE_STORAGE_KEY, JSON.stringify(receipt));
}
