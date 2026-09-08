import { describe, expect, it } from '@jest/globals';

import { formatFlowCount, presentationForStatus } from './mic-flow-presentation';

describe('Basic Mic Flow presentation', () => {
  it('uses exact copy for every server-derived snapshot state', () => {
    expect(presentationForStatus('not_started')).toEqual({
      title: 'Start your Mic Flow.',
      body: 'One completed recording starts your momentum.',
      showCurrent: false,
    });
    expect(presentationForStatus('protected_today')).toMatchObject({ title: 'Your Mic Flow is alive.', showCurrent: true });
    expect(presentationForStatus('needs_rep_today')).toMatchObject({ title: 'Keep the mic hot. One rep today.', showCurrent: true });
    expect(presentationForStatus('recoverable_with_save')).toMatchObject({ title: 'Your Mic Flow can still be saved.', showCurrent: true });
    expect(presentationForStatus('reset_pending')).toMatchObject({ title: 'Start the momentum again.', showCurrent: false });
  });

  it('formats singular and plural counts without prohibited gamification language', () => {
    expect(formatFlowCount(1)).toBe('1 day');
    expect(formatFlowCount(2)).toBe('2 days');
    expect(formatFlowCount(1, 'rep')).toBe('1 rep');
    expect(Object.values(presentationForStatus('not_started')).join(' ')).not.toMatch(/streak|points|XP|freeze/i);
  });

  it('does not describe a reset-pending Flow as active or expose its stale current count', () => {
    const presentation = presentationForStatus('reset_pending');
    expect(presentation.showCurrent).toBe(false);
    expect(`${presentation.title} ${presentation.body}`).not.toMatch(/alive|protected|recoverable/i);
    expect(`${presentation.title} ${presentation.body}`).not.toContain('0');
  });
});
