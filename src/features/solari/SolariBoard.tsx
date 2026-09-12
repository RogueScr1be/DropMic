import { useEffect, useMemo } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { createCompletionGate, shouldAnimateSolari } from '@/features/first-use/first-use-flow';
import { colors, motion, radii, spacing, typography } from '@/ui/theme';
import { useClackSound } from './solari-sound';

type SolariBoardProps = {
  density: 'compact-landscape' | 'phone' | 'tablet';
  prompt: string;
  reducedMotion: boolean;
  revealKey: number;
  onComplete: () => void;
};

export const SOLARI_ROW_COUNT = 5;
export const SOLARI_COLUMN_COUNT = 10;
export const SOLARI_TILE_COUNT = SOLARI_ROW_COUNT * SOLARI_COLUMN_COUNT;

function splitLongWord(word: string) {
  const chunks: string[] = [];
  for (let index = 0; index < word.length; index += SOLARI_COLUMN_COUNT) {
    chunks.push(word.slice(index, index + SOLARI_COLUMN_COUNT));
  }
  return chunks;
}

function justifyWords(words: string[], isLastLine: boolean) {
  if (words.length === 0) {
    return '';
  }
  if (words.length === 1 || isLastLine) {
    return words.join(' ');
  }

  const characterCount = words.reduce((total, word) => total + word.length, 0);
  const gapCount = words.length - 1;
  const spacesToDistribute = Math.max(gapCount, SOLARI_COLUMN_COUNT - characterCount);
  const baseSpaces = Math.floor(spacesToDistribute / gapCount);
  let extraSpaces = spacesToDistribute % gapCount;

  return words.reduce((line, word, index) => {
    if (index === 0) {
      return word;
    }
    const spaces = baseSpaces + (extraSpaces > 0 ? 1 : 0);
    extraSpaces -= extraSpaces > 0 ? 1 : 0;
    return `${line}${' '.repeat(spaces)}${word}`;
  }, '');
}

function wrapSolariPrompt(prompt: string) {
  const words = prompt
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .flatMap((word) => word.length > SOLARI_COLUMN_COUNT ? splitLongWord(word) : word)
    .filter(Boolean);
  const lines: string[][] = [];
  let currentLine: string[] = [];
  let currentLength = 0;

  words.forEach((word) => {
    const nextLength = currentLine.length === 0 ? word.length : currentLength + 1 + word.length;
    if (currentLine.length > 0 && nextLength > SOLARI_COLUMN_COUNT) {
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

  return lines.slice(0, SOLARI_ROW_COUNT).map((line, index, wrappedLines) => justifyWords(line, index === wrappedLines.length - 1));
}

export function buildSolariGrid(prompt: string): string[][] {
  const characters = wrapSolariPrompt(prompt).flatMap((line) => {
    const lineCharacters = Array.from(line).slice(0, SOLARI_COLUMN_COUNT);
    return [
      ...lineCharacters,
      ...Array<string>(SOLARI_COLUMN_COUNT - lineCharacters.length).fill(''),
    ];
  });
  if (characters.length > SOLARI_TILE_COUNT) {
    throw new Error(`Solari prompt exceeds ${SOLARI_TILE_COUNT} positions.`);
  }
  const cells = [...characters, ...Array<string>(SOLARI_TILE_COUNT - characters.length).fill('')];
  return Array.from(
    { length: SOLARI_ROW_COUNT },
    (_, rowIndex) => cells.slice(rowIndex * SOLARI_COLUMN_COUNT, (rowIndex + 1) * SOLARI_COLUMN_COUNT),
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
  const animatedTileCount = useMemo(() => {
    for (let index = characters.length - 1; index >= 0; index -= 1) {
      if (characters[index] !== '') {
        return index + 1;
      }
    }
    return 0;
  }, [characters]);
  const flipValues = useMemo(
    () => characters.map((_, index) => new Animated.Value(reducedMotion || index >= animatedTileCount ? 1 : 0)),
    [animatedTileCount, characters, reducedMotion],
  );

  useEffect(() => {
    const complete = createCompletionGate(onComplete);
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const showStatic = !shouldAnimateSolari(reducedMotion);

    flipValues.forEach((value, index) => value.setValue(showStatic || index >= animatedTileCount ? 1 : 0));

    if (showStatic) {
      const timer = setTimeout(complete, 0);
      timers.push(timer);
      return () => {
        cancelled = true;
        timers.forEach(clearTimeout);
      };
    }

    try {
      characters.slice(0, animatedTileCount).forEach((character, index) => {
        timers.push(
          setTimeout(() => {
            if (!cancelled && character !== '') {
              playClack();
            }
          }, index * motion.solariStagger),
        );
      });

      Animated.stagger(
        motion.solariStagger,
        flipValues.slice(0, animatedTileCount).map((value) =>
          Animated.sequence([
            Animated.timing(value, {
              duration: 48,
              toValue: 0.52,
              useNativeDriver: true,
            }),
            Animated.timing(value, {
              duration: 34,
              toValue: 0.86,
              useNativeDriver: true,
            }),
            Animated.timing(value, {
              duration: 42,
              toValue: 1,
              useNativeDriver: true,
            }),
          ]),
        ),
      ).start(({ finished }) => {
        if (finished && !cancelled) {
          complete();
        }
      });
    } catch {
      if (!cancelled) {
        flipValues.forEach((value) => value.setValue(1));
        complete();
      }
    }

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      flipValues.forEach((value) => value.stopAnimation());
    };
  }, [animatedTileCount, characters, flipValues, onComplete, playClack, reducedMotion, revealKey]);

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
            {row.map((character, columnIndex) => {
              const index = rowIndex * SOLARI_COLUMN_COUNT + columnIndex;
              return (
                <Animated.View
                  key={`${revealKey}-${index}`}
                  style={[
                    styles.cell,
                    density === 'compact-landscape' && styles.cellCompact,
                    density === 'tablet' && styles.cellTablet,
                    shouldAnimateSolari(reducedMotion) && {
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
                      character === ' ' && styles.wordSpace,
                    ]}>
                    {character === ' ' ? '' : character}
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
    fontFamily: typography.displayFamily,
    fontSize: 31,
    fontWeight: '900',
    includeFontPadding: false,
    lineHeight: 34,
  },
  characterCompact: { fontSize: 21, lineHeight: 24 },
  characterTablet: { fontSize: 43, lineHeight: 48 },
  wordSpace: { color: 'transparent' },
});
