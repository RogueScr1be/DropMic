import { createClientAttemptId } from '@/features/auth/auth-recovery';

export type TakeIdentity = {
  clientAttemptId: string;
  quickReadIdempotencyKey: string;
};

export function createTakeIdentity(createId: () => string = () => createClientAttemptId()): TakeIdentity {
  return {
    clientAttemptId: createId(),
    quickReadIdempotencyKey: createId(),
  };
}

export function isCurrentTake(requestTakeId: string, activeTakeId: string): boolean {
  return requestTakeId === activeTakeId;
}
