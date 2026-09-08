import React from 'react';
import { describe, expect, it } from '@jest/globals';
import { act, create } from 'react-test-renderer';

import { MicFlowCard } from './MicFlowCard';

const state = {
  status: 'needs_rep_today' as const,
  current_flow: 2,
  best_flow: 5,
  saves_available: 1,
  last_qualified_day: '2026-09-03',
  timezone: 'America/Chicago',
};

function textContent(node: unknown): string {
  if (typeof node === 'string') {
    return node;
  }
  if (!node || typeof node !== 'object') {
    return '';
  }
  const children = (node as { children?: unknown[] }).children ?? [];
  return children.map(textContent).join(' ');
}

describe('MicFlowCard', () => {
  it('renders the server snapshot state and all authoritative counts', () => {
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(React.createElement(MicFlowCard, { loading: false, snapshot: state }));
    });
    const text = textContent(tree!.toJSON());
    expect(text).toContain('Mic Flow: 2 days');
    expect(text).toContain('Keep the mic hot. One rep today.');
    expect(text).toContain('5 days');
    expect(text).toContain('1');
  });

  it('renders loading and unavailable without fabricated counts', () => {
    let loadingTree: ReturnType<typeof create>;
    let unavailableTree: ReturnType<typeof create>;
    act(() => {
      loadingTree = create(React.createElement(MicFlowCard, { loading: true, snapshot: null }));
      unavailableTree = create(React.createElement(MicFlowCard, { loading: false, snapshot: null }));
    });
    expect(textContent(loadingTree!.toJSON())).toContain('Checking your Mic Flow');
    const unavailable = textContent(unavailableTree!.toJSON());
    expect(unavailable).toContain('Mic Flow is unavailable right now.');
    expect(unavailable).not.toContain('0 days');
  });

  it('keeps Best visible while hiding stale current Flow for reset-pending state', () => {
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(React.createElement(MicFlowCard, {
        loading: false,
        snapshot: { ...state, status: 'reset_pending', current_flow: 8, best_flow: 13 },
      }));
    });
    const text = textContent(tree!.toJSON());
    expect(text).toContain('13 days');
    expect(text).not.toContain('Mic Flow: 8 days');
    expect(text).not.toMatch(/alive|protected/i);
    expect(text).not.toContain('Mic Flow: 0 days');
  });
});
