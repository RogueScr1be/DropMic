import { useEffect, useMemo } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { createCompletionGate } from '@/features/first-use/first-use-flow';
import { useClackSound } from './solari-sound';

type SolariBoardProps = {
  prompt: string;
  reducedMotion: boolean;
  soundEnabled: boolean;
  revealKey: number;
  onComplete: () => void;
};

export function SolariBoard({
  prompt,
  reducedMotion,
  soundEnabled,
  revealKey,
  onComplete,
}: SolariBoardProps) {
  const playClack = useClackSound(soundEnabled);
  const characters = useMemo(() => prompt.toUpperCase().split(''), [prompt]);
  const flipValues = useMemo(
    () => characters.map(() => new Animated.Value(reducedMotion ? 1 : 0)),
    [characters, reducedMotion],
  );

  useEffect(() => {
    const complete = createCompletionGate(onComplete);
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const showStatic = reducedMotion;

    flipValues.forEach((value) => value.setValue(showStatic ? 1 : 0));

    if (showStatic) {
      const timer = setTimeout(complete, 0);
      timers.push(timer);
      return () => {
        cancelled = true;
        timers.forEach(clearTimeout);
      };
    }

    try {
      characters.forEach((_, index) => {
        timers.push(
          setTimeout(() => {
            if (!cancelled) {
              playClack();
            }
          }, index * 90),
        );
      });

      Animated.stagger(
        90,
        flipValues.map((value) =>
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
  }, [characters, flipValues, onComplete, playClack, reducedMotion, revealKey]);

  return (
    <View
      accessibilityLabel={`Speaking prompt: ${prompt}`}
      accessibilityRole="text"
      style={styles.board}>
      <View style={styles.boardRail} />
      <View style={styles.cells}>
        {characters.map((character, index) => (
          <Animated.View
            key={`${revealKey}-${index}`}
            style={[
              styles.cell,
              {
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
            ]}>
            <Text style={styles.character}>{character === ' ' ? '·' : character}</Text>
            <View style={styles.cellDivider} />
          </Animated.View>
        ))}
      </View>
      <View style={styles.boardRail} />
    </View>
  );
}

const styles = StyleSheet.create({
  board: {
    alignSelf: 'stretch',
    backgroundColor: '#182624',
    borderColor: '#345149',
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 20,
  },
  boardRail: {
    backgroundColor: '#52756b',
    height: 2,
    opacity: 0.6,
  },
  cells: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    justifyContent: 'center',
  },
  cell: {
    alignItems: 'center',
    backgroundColor: '#f0e5d3',
    borderColor: '#a89478',
    borderRadius: 4,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 30,
  },
  cellDivider: {
    backgroundColor: '#8e7a61',
    height: 1,
    left: 0,
    opacity: 0.65,
    position: 'absolute',
    right: 0,
    top: '50%',
  },
  character: {
    color: '#182624',
    fontFamily: 'Georgia',
    fontSize: 20,
    fontWeight: '700',
  },
});
