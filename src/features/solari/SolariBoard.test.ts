import React from 'react';
import { describe, expect, it, jest } from '@jest/globals';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';

import { createCompletionGate, shouldAnimateSolari } from '@/features/first-use/first-use-flow';
import {
  buildSolariGrid,
  SOLARI_COLUMN_COUNT,
  SOLARI_ROW_COUNT,
  SOLARI_TILE_COUNT,
  SolariBoard,
} from './SolariBoard';

jest.mock('./solari-sound', () => ({ useClackSound: () => () => undefined }));

function renderBoard(prompt: string, revealKey = 0) {
  let tree: ReturnType<typeof create>;
  act(() => {
    tree = create(React.createElement(SolariBoard, {
      density: 'phone',
      onComplete: () => undefined,
      prompt,
      reducedMotion: true,
      revealKey,
    }));
  });
  return tree!;
}

describe('Solari board contracts', () => {
  it('disables movement when reduced motion is enabled', () => {
    expect(shouldAnimateSolari(true)).toBe(false);
    expect(shouldAnimateSolari(false)).toBe(true);
  });

  it('uses a static completion path when reduced motion is enabled', () => {
    let completions = 0;
    const complete = createCompletionGate(() => {
      completions += 1;
    });

    complete();
    complete();

    expect(completions).toBe(1);
  });

  it('renders exactly five rows of ten physical tiles', () => {
    const tree = renderBoard('Short prompt?');
    const rows = tree.root.findAll((node) => typeof node.props.testID === 'string' && node.props.testID.startsWith('solari-row-'));
    const tiles = tree.root.findAll((node) => typeof node.props.testID === 'string' && node.props.testID.startsWith('solari-tile-'));
    const rowIds = new Set(rows.map((row) => row.props.testID));
    const tileIds = new Set(tiles.map((tile) => tile.props.testID));

    expect(rowIds.size).toBe(SOLARI_ROW_COUNT);
    expect(tileIds.size).toBe(SOLARI_TILE_COUNT);
    rows.forEach((row) => {
      const renderedTileIds = new Set(
        row
          .findAll((node) => typeof node.props.testID === 'string' && node.props.testID.startsWith('solari-tile-'))
          .map((tile) => tile.props.testID),
      );
      expect(renderedTileIds.size).toBe(SOLARI_COLUMN_COUNT);
    });
    buildSolariGrid('Short prompt?').forEach((row) => expect(row).toHaveLength(SOLARI_COLUMN_COUNT));
  });

  it('wraps by whole words into the fixed tile grid', () => {
    const prompt = 'Which everyday invention deserves more credit?';
    const grid = buildSolariGrid(prompt);

    expect(Array.from(prompt)).toHaveLength(46);
    expect(grid.flat()).toHaveLength(SOLARI_TILE_COUNT);
    expect(grid.map((row) => row.join(''))).toEqual([
      'WHICH',
      'EVERYDAY',
      'INVENTION',
      'DESERVES',
      'MORE',
    ]);
    grid.forEach((row) => expect(row).toHaveLength(SOLARI_COLUMN_COUNT));
  });

  it('keeps common words intact instead of splitting them across rows', () => {
    const grid = buildSolariGrid('What could you teach someone in ten minutes?');
    const rows = grid.map((row) => row.join(''));

    expect(rows).toContain('MINUTES?');
    rows.forEach((row, index) => {
      expect(row).not.toMatch(/MINU$|^TES/);
      expect(grid[index]).toHaveLength(SOLARI_COLUMN_COUNT);
    });
  });

  it('keeps the natural prompt accessible while rendering blank space tiles silently', () => {
    const prompt = 'A pause, then: go!';
    const tree = renderBoard(prompt);
    const board = tree.root.findByProps({ accessibilityLabel: `Speaking prompt: ${prompt}` });
    const emptyTile = tree.root.findByProps({ testID: 'solari-tile-1' });

    expect(board.props.accessibilityRole).toBe('text');
    expect(emptyTile.findByType(Text).props.children).toBe('');
    expect(buildSolariGrid(prompt).flat()[4]).toBe('P');
  });

  it('retains the fixed grid after a reroll on the reduced-motion path', () => {
    const tree = renderBoard('First prompt.', 1);
    act(() => {
      tree.update(React.createElement(SolariBoard, {
        density: 'tablet',
        onComplete: () => undefined,
        prompt: 'New drop!',
        reducedMotion: true,
        revealKey: 2,
      }));
    });

    const tileIds = new Set(
      tree.root
        .findAll((node) => typeof node.props.testID === 'string' && node.props.testID.startsWith('solari-tile-'))
        .map((tile) => tile.props.testID),
    );
    expect(tileIds.size).toBe(50);
  });
});
