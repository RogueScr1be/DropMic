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
  it('starts collapsed and expands and collapses authoritative details', () => {
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(React.createElement(MicFlowCard, { loading: false, snapshot: state }));
    });
    const toggle = tree!.root.findByProps({ testID: 'mic-flow-toggle' });
    expect(toggle.props.accessibilityState).toEqual({ expanded: false });
    expect(textContent(tree!.toJSON())).toContain('Mic Flow: 2 days');
    expect(textContent(tree!.toJSON())).not.toContain('Keep the mic hot. One rep today.');

    act(() => toggle.props.onPress());
    expect(tree!.root.findByProps({ testID: 'mic-flow-toggle' }).props.accessibilityState).toEqual({ expanded: true });
    expect(textContent(tree!.toJSON())).toContain('Keep the mic hot. One rep today.');
    expect(textContent(tree!.toJSON())).toContain('5 days');

    act(() => tree!.root.findByProps({ testID: 'mic-flow-toggle' }).props.onPress());
    expect(tree!.root.findAllByProps({ testID: 'mic-flow-details' })).toHaveLength(0);
  });

  it('renders loading and unavailable without fabricated counts', () => {
    let loadingTree: ReturnType<typeof create>;
    let unavailableTree: ReturnType<typeof create>;
    act(() => {
      loadingTree = create(React.createElement(MicFlowCard, { loading: true, snapshot: null }));
      unavailableTree = create(React.createElement(MicFlowCard, { loading: false, snapshot: null }));
    });
    expect(textContent(loadingTree!.toJSON())).toContain('Checking');
    const unavailable = textContent(unavailableTree!.toJSON());
    expect(unavailable).toContain('Unavailable');
    expect(unavailable).not.toContain('0 days');

    act(() => unavailableTree!.root.findByProps({ testID: 'mic-flow-toggle' }).props.onPress());
    expect(textContent(unavailableTree!.toJSON())).toContain('Mic Flow is unavailable right now.');
    expect(textContent(unavailableTree!.toJSON())).not.toContain('0 days');
  });

  it('keeps Best visible while hiding stale current Flow for reset-pending state', () => {
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(React.createElement(MicFlowCard, {
        loading: false,
        snapshot: { ...state, status: 'reset_pending', current_flow: 8, best_flow: 13 },
      }));
    });
    act(() => tree!.root.findByProps({ testID: 'mic-flow-toggle' }).props.onPress());
    const text = textContent(tree!.toJSON());
    expect(text).toContain('13 days');
    expect(text).not.toContain('Mic Flow: 8 days');
    expect(text).not.toMatch(/alive|protected/i);
    expect(text).not.toContain('Mic Flow: 0 days');
  });
});
