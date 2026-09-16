import { createClientAttemptId } from '@/features/auth/auth-recovery';

export type TakeIdentity = {
  clientAttemptId: string;
  quickReadIdempotencyKey: string;
};

export type TakeIdentityLifecycle = {
  identity: TakeIdentity;
  status: 'pending' | 'consumed';
};

export function createTakeIdentity(createId: () => string = () => createClientAttemptId()): TakeIdentity {
  return {
    clientAttemptId: createId(),
    quickReadIdempotencyKey: createId(),
  };
}

export function createPendingTakeIdentity(identity: TakeIdentity): TakeIdentityLifecycle {
  return { identity, status: 'pending' };
}

export function createConsumedTakeIdentity(identity: TakeIdentity): TakeIdentityLifecycle {
  return { identity, status: 'consumed' };
}

export function consumeTakeIdentity(lifecycle: TakeIdentityLifecycle): TakeIdentityLifecycle {
  return lifecycle.status === 'consumed' ? lifecycle : createConsumedTakeIdentity(lifecycle.identity);
}

export function prepareIdentityForRecording(
  lifecycle: TakeIdentityLifecycle,
  createIdentity: () => TakeIdentity = () => createTakeIdentity(),
): { lifecycle: TakeIdentityLifecycle; rotated: boolean } {
  if (lifecycle.status === 'pending') {
    return { lifecycle, rotated: false };
  }
  return {
    lifecycle: createPendingTakeIdentity(createIdentity()),
    rotated: true,
  };
}

export function isCurrentTake(requestTakeId: string, activeTakeId: string): boolean {
  return requestTakeId === activeTakeId;
}
