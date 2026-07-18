import { create } from 'zustand';

import {
  initialRecordingContext,
  transition,
  type RecordingContext,
  type RecordingEvent,
} from './recording-machine';

type RecordingStore = RecordingContext & {
  dispatch: (event: RecordingEvent) => void;
  setNow: (nowMs: number) => void;
};

export const useRecordingStore = create<RecordingStore>((set) => ({
  ...initialRecordingContext,
  dispatch: (event) =>
    set((context) => {
      try {
        return transition(context, event, Date.now());
      } catch (error) {
        return {
          ...context,
          state: 'error',
          error: error instanceof Error ? error.message : 'Invalid recording action.',
          nowMs: Date.now(),
        };
      }
    }),
  setNow: (nowMs) => set((context) => ({ ...context, nowMs })),
}));
