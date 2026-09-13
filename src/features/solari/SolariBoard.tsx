import { useEffect, useMemo, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';

import { createCompletionGate, shouldAnimateSolari } from '@/features/first-use/first-use-flow';
import { colors, radii, spacing } from '@/ui/theme';
import { tapSolariHaptic, useClackSound } from './solari-sound';

type SolariBoardProps = {
  density: 'compact-landscape' | 'phone' | 'tablet';
  prompt: string;
  reducedMotion: boolean;
  revealKey: number;
  onComplete: () => void;
};

export const SOLARI_ROW_COUNT = 5;
export const SOLARI_COLUMN_COUNT = 10;
export const SOLARI_MAX_COLUMN_COUNT = 12;
export const SOLARI_MIN_TILE_COUNT = SOLARI_ROW_COUNT * SOLARI_COLUMN_COUNT;
export const SOLARI_MAX_TILE_COUNT = SOLARI_ROW_COUNT * SOLARI_MAX_COLUMN_COUNT;
export const SOLARI_REVEAL_DURATION_MS = 980;

const SOLARI_SHUFFLE_INTERVAL_MS = 58;
const SOLARI_HAPTIC_INTERVAL_MS = 125;
const DECOY_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ?!';

function splitLongWord(word: string, columnCount: number) {
  const chunks: string[] = [];
  for (let index = 0; index < word.length; index += columnCount) {
    chunks.push(word.slice(index, index + columnCount));
  }
  return chunks;
}

function normalizedPromptWords(prompt: string, columnCount: number) {
  return prompt
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .flatMap((word) => word.length > columnCount ? splitLongWord(word, columnCount) : word)
    .filter(Boolean);
}

function wrapSolariPrompt(prompt: string, columnCount: number) {
  const words = prompt
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .flatMap((word) => word.length > columnCount ? splitLongWord(word, columnCount) : word)
    .filter(Boolean);
  const lines: string[][] = [];
  let currentLine: string[] = [];
  let currentLength = 0;

  words.forEach((word) => {
    const nextLength = currentLine.length === 0 ? word.length : currentLength + 1 + word.length;
    if (currentLine.length > 0 && nextLength > columnCount) {
      lines.push(currentLine);
      currentLine = [word];
      currentLength = word.length;
      return;
    }
    currentLine.push(word);
    currentLength = nextLength;
  });

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines.map((line) => line.join(' '));
}

function chooseColumnCount(prompt: string) {
  for (let columnCount = SOLARI_COLUMN_COUNT; columnCount <= SOLARI_MAX_COLUMN_COUNT; columnCount += 1) {
    if (wrapSolariPrompt(prompt, columnCount).length <= SOLARI_ROW_COUNT) {
      return columnCount;
    }
  }
  return SOLARI_MAX_COLUMN_COUNT;
}

function randomDecoyCharacter(index: number) {
  return DECOY_CHARACTERS[index % DECOY_CHARACTERS.length];
}

function buildDecoyCharacters(total: number, offset: number) {
  return Array.from({ length: total }, (_, index) => randomDecoyCharacter(index + offset));
}

export function buildSolariGrid(prompt: string): string[][] {
  const columnCount = chooseColumnCount(prompt);
  const lines = wrapSolariPrompt(prompt, columnCount);
  const fallbackWords = normalizedPromptWords(prompt, columnCount);
  const fittedLines = lines.length <= SOLARI_ROW_COUNT ? lines : fallbackWords.slice(0, SOLARI_ROW_COUNT);
  const characters = fittedLines.flatMap((line) => {
    const lineCharacters = Array.from(line).slice(0, columnCount);
    return [
      ...lineCharacters,
      ...Array<string>(columnCount - lineCharacters.length).fill(''),
    ];
  });
  if (characters.length > SOLARI_MAX_TILE_COUNT) {
    throw new Error(`Solari prompt exceeds ${SOLARI_MAX_TILE_COUNT} positions.`);
  }
  const cells = [...characters, ...Array<string>((SOLARI_ROW_COUNT * columnCount) - characters.length).fill('')];
  return Array.from(
    { length: SOLARI_ROW_COUNT },
    (_, rowIndex) => cells.slice(rowIndex * columnCount, (rowIndex + 1) * columnCount),
  );
}

export function SolariBoard({
  density,
  prompt,
  reducedMotion,
  revealKey,
  onComplete,
}: SolariBoardProps) {
  const playClack = useClackSound(true);
  const rows = useMemo(() => buildSolariGrid(prompt), [prompt]);
  const characters = useMemo(() => rows.flat(), [rows]);
  const shouldAnimateReveal = shouldAnimateSolari(reducedMotion);
  const [displayCharacters, setDisplayCharacters] = useState(() =>
    shouldAnimateReveal ? buildDecoyCharacters(characters.length, 0) : characters,
  );
  const visibleCharacters = shouldAnimateReveal ? displayCharacters : characters;
  const flipValues = useMemo(
    () => characters.map(() => new Animated.Value(reducedMotion ? 1 : 0)),
    [characters, reducedMotion],
  );

  useEffect(() => {
    const complete = createCompletionGate(onComplete);
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const intervals: ReturnType<typeof setInterval>[] = [];
    let decoyOffset = 0;
    const showStatic = !shouldAnimateReveal;

    flipValues.forEach((value) => value.setValue(showStatic ? 1 : 0));

    if (showStatic) {
      playClack();
      const timer = setTimeout(complete, 0);
      timers.push(timer);
      return () => {
        cancelled = true;
        timers.forEach(clearTimeout);
      };
    }

    try {
      playClack();
      const initialDecoyTimer = setTimeout(() => {
        if (!cancelled) {
          setDisplayCharacters(buildDecoyCharacters(characters.length, decoyOffset));
        }
      }, 0);
      timers.push(initialDecoyTimer);
      const shuffleTimer = setInterval(() => {
        if (!cancelled) {
          decoyOffset += 7;
          setDisplayCharacters(buildDecoyCharacters(characters.length, decoyOffset));
        }
      }, SOLARI_SHUFFLE_INTERVAL_MS);
      intervals.push(shuffleTimer);
      const hapticTimer = setInterval(() => {
        if (!cancelled) {
          tapSolariHaptic();
        }
      }, SOLARI_HAPTIC_INTERVAL_MS);
      intervals.push(hapticTimer);
      const animations = flipValues.map((value) =>
        Animated.loop(
          Animated.sequence([
            Animated.timing(value, {
              duration: 46,
              toValue: 1,
              useNativeDriver: true,
            }),
            Animated.timing(value, {
              duration: 46,
              toValue: 0,
              useNativeDriver: true,
            }),
          ]),
          { iterations: Math.ceil(SOLARI_REVEAL_DURATION_MS / 92) },
        ),
      );
      const parallelAnimation = Animated.parallel(animations);
      parallelAnimation.start();
      timers.push(
        setTimeout(() => {
          clearInterval(shuffleTimer);
          clearInterval(hapticTimer);
          if (!cancelled) {
            parallelAnimation.stop();
            setDisplayCharacters(characters);
            flipValues.forEach((value) => value.setValue(1));
            complete();
          }
        }, SOLARI_REVEAL_DURATION_MS),
      );
    } catch {
      if (!cancelled) {
        flipValues.forEach((value) => value.setValue(1));
        timers.push(
          setTimeout(() => {
            setDisplayCharacters(characters);
            complete();
          }, 0),
        );
      }
    }

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      intervals.forEach(clearInterval);
      flipValues.forEach((value) => value.stopAnimation());
    };
  }, [characters, flipValues, onComplete, playClack, revealKey, shouldAnimateReveal]);

  return (
    <View
      accessible
      accessibilityLabel={`Speaking prompt: ${prompt}`}
      accessibilityRole="text"
      style={[styles.board, density === 'compact-landscape' && styles.boardCompact]}>
      <View style={styles.boardRail} />
      <View style={styles.grid}>
        {rows.map((row, rowIndex) => (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            key={`row-${rowIndex}`}
            style={styles.row}
            testID={`solari-row-${rowIndex}`}>
            {row.map((_, columnIndex) => {
              const index = rows.slice(0, rowIndex).reduce((total, currentRow) => total + currentRow.length, 0) + columnIndex;
              const displayCharacter = visibleCharacters[index] ?? '';
              return (
                <Animated.View
                  key={`${revealKey}-${index}`}
                  style={[
                    styles.cell,
                    density === 'compact-landscape' && styles.cellCompact,
                    density === 'tablet' && styles.cellTablet,
                    shouldAnimateReveal && {
                      transform: [
                        { perspective: 500 },
                        {
                          rotateX: flipValues[index].interpolate({
                            inputRange: [0, 0.5, 1],
                            outputRange: ['0deg', '-94deg', '0deg'],
                          }),
                        },
                        {
                          scaleY: flipValues[index].interpolate({
                            inputRange: [0, 0.5, 0.86, 1],
                            outputRange: [1, 0.92, 1.05, 1],
                          }),
                        },
                      ],
                    },
                  ]}
                  testID={`solari-tile-${index}`}>
                  <Text
                    maxFontSizeMultiplier={1}
                    style={[
                      styles.character,
                      density === 'compact-landscape' && styles.characterCompact,
                      density === 'tablet' && styles.characterTablet,
                      displayCharacter === 'I' && styles.characterI,
                      displayCharacter === ' ' && styles.wordSpace,
                    ]}>
                    {displayCharacter === ' ' ? '' : displayCharacter}
                  </Text>
                  <View style={styles.cellDivider} />
                </Animated.View>
              );
            })}
          </View>
        ))}
      </View>
      <View style={styles.boardRail} />
    </View>
  );
}

const styles = StyleSheet.create({
  board: {
    alignSelf: 'stretch',
    backgroundColor: colors.background,
    borderRadius: radii.lg,
    gap: spacing.xs,
    padding: 0,
  },
  boardCompact: { gap: spacing.xs },
  boardRail: {
    backgroundColor: colors.border,
    height: 2,
    opacity: 0.7,
  },
  grid: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  cell: {
    alignItems: 'center',
    backgroundColor: colors.boardCell,
    borderColor: colors.boardCellBorder,
    borderRadius: 6,
    borderWidth: 1,
    flex: 1,
    height: 50,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cellCompact: { height: 34 },
  cellTablet: { height: 68 },
  cellDivider: {
    backgroundColor: colors.boardCellBorder,
    height: 1,
    left: 0,
    opacity: 0.65,
    position: 'absolute',
    right: 0,
    top: '50%',
  },
  character: {
    color: colors.inkStrong,
    fontFamily: Platform.select({ android: 'monospace', ios: 'Menlo', web: 'ui-monospace, SFMono-Regular, Menlo, monospace' }),
    fontSize: 31,
    fontWeight: '900',
    includeFontPadding: false,
    lineHeight: 34,
  },
  characterCompact: { fontSize: 21, lineHeight: 24 },
  characterTablet: { fontSize: 45, fontWeight: '900', letterSpacing: -1, lineHeight: 50 },
  characterI: { transform: [{ scaleX: 1.18 }] },
  wordSpace: { color: 'transparent' },
});
