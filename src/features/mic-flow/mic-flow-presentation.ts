import type { MicFlowSnapshotStatus } from './mic-flow-service';

export type MicFlowPresentation = {
  title: string;
  body: string;
  showCurrent: boolean;
};

export function formatFlowCount(count: number, noun = 'day') {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

export function presentationForStatus(status: MicFlowSnapshotStatus): MicFlowPresentation {
  switch (status) {
    case 'not_started':
      return {
        title: 'Start your Mic Flow.',
        body: 'One completed recording starts your momentum.',
        showCurrent: false,
      };
    case 'protected_today':
      return {
        title: 'Your Mic Flow is alive.',
        body: 'Come back tomorrow to keep the momentum going.',
        showCurrent: true,
      };
    case 'needs_rep_today':
      return {
        title: 'Keep the mic hot. One rep today.',
        body: 'Complete one recording to protect your Flow.',
        showCurrent: true,
      };
    case 'recoverable_with_save':
      return {
        title: 'Your Mic Flow can still be saved.',
        body: 'Complete today’s rep to use a Mic Save.',
        showCurrent: true,
      };
    case 'reset_pending':
      return {
        title: 'Start the momentum again.',
        body: 'Your current Flow will reset on the next completion.',
        showCurrent: false,
      };
  }
}
