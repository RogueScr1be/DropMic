import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { SPLASH_DURATION_MS, createCompletionGate } from './first-use-flow';

type SplashRevealProps = {
  reducedMotion: boolean;
  onComplete: () => void;
};

export function SplashReveal({ reducedMotion, onComplete }: SplashRevealProps) {
  const [opacity] = useState(() => new Animated.Value(0));
  const [markScale] = useState(() => new Animated.Value(0.92));

  useEffect(() => {
    const complete = createCompletionGate(onComplete);
    let completionTimer: ReturnType<typeof setTimeout> | null = null;
    if (reducedMotion) {
      completionTimer = setTimeout(complete, 0);
      return () => {
        if (completionTimer) clearTimeout(completionTimer);
      };
    }

    const animation = Animated.parallel([
      Animated.timing(opacity, { duration: 500, toValue: 1, useNativeDriver: true }),
      Animated.spring(markScale, {
        friction: 8,
        tension: 60,
        toValue: 1,
        useNativeDriver: true,
      }),
    ]);
    animation.start(({ finished }) => {
      if (finished) {
        completionTimer = setTimeout(complete, SPLASH_DURATION_MS - 500);
      }
    });

    return () => {
      animation.stop();
      if (completionTimer) clearTimeout(completionTimer);
    };
  }, [markScale, onComplete, opacity, reducedMotion]);

  return (
    <View accessibilityLabel="MicDrop" accessibilityRole="text" style={styles.container}>
      <Animated.View style={[styles.mark, { opacity, transform: [{ scale: markScale }] }]}>
        <Text style={styles.kicker}>SPEAKING PRACTICE</Text>
        <Text style={styles.wordmark}>MIC</Text>
        <Text style={styles.wordmarkAccent}>DROP</Text>
        <View style={styles.signal} />
      </Animated.View>
      <Text style={styles.footer}>ONE TAKE. YOUR VOICE.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#071918',
    flex: 1,
    justifyContent: 'center',
    padding: 28,
  },
  footer: {
    bottom: 36,
    color: '#86a79d',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2.4,
    position: 'absolute',
  },
  kicker: {
    color: '#86a79d',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 3,
    marginBottom: 20,
    textAlign: 'center',
  },
  mark: { alignItems: 'center' },
  signal: {
    backgroundColor: '#ff6b35',
    borderRadius: 99,
    height: 12,
    marginTop: 22,
    width: 12,
  },
  wordmark: {
    color: '#f4ebdd',
    fontFamily: 'Georgia',
    fontSize: 72,
    fontWeight: '700',
    letterSpacing: -5,
    lineHeight: 72,
  },
  wordmarkAccent: {
    color: '#ff6b35',
    fontFamily: 'Georgia',
    fontSize: 72,
    fontWeight: '700',
    letterSpacing: -5,
    lineHeight: 72,
  },
});
