import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '@/ui/theme';

type SplashRevealProps = {
  reducedMotion: boolean;
};

export function SplashReveal({ reducedMotion }: SplashRevealProps) {
  const [opacity] = useState(() => new Animated.Value(reducedMotion ? 1 : 0));

  useEffect(() => {
    if (reducedMotion) {
      opacity.setValue(1);
      return undefined;
    }

    const animation = Animated.timing(opacity, { duration: 500, toValue: 1, useNativeDriver: true });
    animation.start();

    return () => {
      animation.stop();
    };
  }, [opacity, reducedMotion]);

  return (
    <View accessibilityLabel="DropMic" accessibilityRole="text" style={styles.container} testID="splash-reveal">
      <Animated.View style={[styles.mark, { opacity }]}>
        <Text maxFontSizeMultiplier={1.5} style={styles.kicker}>ONE PROMPT. ONE TAKE.</Text>
        <Text maxFontSizeMultiplier={1.35} style={styles.wordmark}>DropMic</Text>
        <View style={styles.signal} />
      </Animated.View>
      <Text maxFontSizeMultiplier={1.5} style={styles.footer}>SPEAK IT THROUGH.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: colors.inkStrong,
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xxxl,
  },
  footer: {
    bottom: 36,
    color: colors.coralSoft,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2.4,
    position: 'absolute',
  },
  kicker: {
    color: colors.coralSoft,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 3,
    marginBottom: 20,
    textAlign: 'center',
  },
  mark: { alignItems: 'center' },
  signal: {
    backgroundColor: colors.coral,
    borderRadius: 99,
    height: 12,
    marginTop: 22,
    width: 12,
  },
  wordmark: { color: colors.background, fontFamily: typography.displayFamily, fontSize: 68, fontWeight: '700', letterSpacing: -3, lineHeight: 76 },
});
