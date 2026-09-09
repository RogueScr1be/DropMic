import { useEffect, useMemo } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { createCompletionGate, shouldAnimateSolari } from '@/features/first-use/first-use-flow';
import { colors, motion, radii, shadows, spacing, typography } from '@/ui/theme';
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

export function buildSolariGrid(prompt: string): string[][] {
  const characters = Array.from(prompt.toUpperCase());
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
  const promptCharacters = useMemo(() => Array.from(prompt.toUpperCase()), [prompt]);
  const rows = useMemo(() => buildSolariGrid(prompt), [prompt]);
  const characters = useMemo(() => rows.flat(), [rows]);
  const flipValues = useMemo(
    () => characters.map((_, index) => new Animated.Value(reducedMotion || index >= promptCharacters.length ? 1 : 0)),
    [characters, promptCharacters.length, reducedMotion],
  );

  useEffect(() => {
    const complete = createCompletionGate(onComplete);
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const showStatic = !shouldAnimateSolari(reducedMotion);

    flipValues.forEach((value, index) => value.setValue(showStatic || index >= promptCharacters.length ? 1 : 0));

    if (showStatic) {
      const timer = setTimeout(complete, 0);
      timers.push(timer);
      return () => {
        cancelled = true;
        timers.forEach(clearTimeout);
      };
    }

    try {
      promptCharacters.forEach((_, index) => {
        timers.push(
          setTimeout(() => {
            if (!cancelled) {
              playClack();
            }
          }, index * motion.solariStagger),
        );
      });

      Animated.stagger(
        motion.solariStagger,
        flipValues.slice(0, promptCharacters.length).map((value) =>
          Animated.timing(value, {
            duration: 150,
            toValue: 1,
            useNativeDriver: true,
          }),
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
  }, [flipValues, onComplete, playClack, promptCharacters, reducedMotion, revealKey]);

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
                            outputRange: ['0deg', '-88deg', '0deg'],
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
                    {character === ' ' ? '·' : character}
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
    backgroundColor: colors.board,
    borderColor: colors.boardRail,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.sm,
    padding: spacing.lg,
    ...shadows.card,
  },
  boardCompact: { gap: spacing.xs, padding: spacing.md },
  boardRail: {
    backgroundColor: colors.boardRail,
    height: 2,
    opacity: 0.6,
  },
  grid: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
  },
  cell: {
    alignItems: 'center',
    backgroundColor: colors.boardCell,
    borderColor: colors.boardCellBorder,
    borderRadius: 4,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 28,
  },
  cellCompact: { height: 28, width: 36 },
  cellTablet: { height: 58, width: 52 },
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
    fontSize: 20,
    fontWeight: '700',
  },
  characterCompact: { fontSize: 16 },
  characterTablet: { fontSize: 24 },
  wordSpace: { color: colors.boardCellBorder },
});
