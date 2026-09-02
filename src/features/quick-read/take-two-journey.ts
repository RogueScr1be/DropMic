import { createTakeIdentity, type TakeIdentity } from './attempt-identity';
import type { RecordingDuration } from '@/features/recording/recording-machine';

export type TakeTwoTake = {
  baselineRunId: string;
  topicId: string;
  duration: RecordingDuration;
  identity: TakeIdentity;
};

export function createTakeTwoTake(input: {
  baselineRunId: string;
  topicId: string;
  duration: RecordingDuration;
  createId?: () => string;
}): TakeTwoTake {
  return {
    baselineRunId: input.baselineRunId,
    topicId: input.topicId,
    duration: input.duration,
    identity: createTakeIdentity(input.createId),
  };
}
