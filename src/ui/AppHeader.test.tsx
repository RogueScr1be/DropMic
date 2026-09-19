import React from 'react';
import { describe, expect, it, jest } from '@jest/globals';
import { act, create } from 'react-test-renderer';

import { AppHeader } from './AppHeader';

describe('AppHeader settings ownership', () => {
  it('removes Settings while an owning Quick Read is mounted', () => {
    let visibleTree!: ReturnType<typeof create>;
    let hiddenTree!: ReturnType<typeof create>;

    act(() => {
      visibleTree = create(React.createElement(AppHeader, { onSettings: jest.fn(), settingsHidden: false }));
      hiddenTree = create(React.createElement(AppHeader, { onSettings: jest.fn(), settingsHidden: true }));
    });

    expect(visibleTree.root.findByProps({ accessibilityLabel: 'Settings' })).toBeTruthy();
    expect(hiddenTree.root.findAllByProps({ accessibilityLabel: 'Settings' })).toHaveLength(0);
    expect(hiddenTree.root.findByProps({ importantForAccessibility: 'no-hide-descendants' })).toBeTruthy();
  });
});
