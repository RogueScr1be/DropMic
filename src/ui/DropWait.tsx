import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { colors, typography } from './theme';

export function DropWait({ reducedMotion }: { reducedMotion: boolean }) {
  const [opacity] = useState(() => new Animated.Value(1));

  useEffect(() => {
    opacity.stopAnimation();
    if (reducedMotion) {
      opacity.setValue(1);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { duration: 900, toValue: 0.45, useNativeDriver: true }),
        Animated.timing(opacity, { duration: 900, toValue: 1, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => {
      animation.stop();
      opacity.stopAnimation();
    };
  }, [opacity, reducedMotion]);

  return (
    <Animated.View accessibilityLabel="Analyzing Drop" style={[styles.container, { opacity }]} testID="drop-wait">
      <Text style={styles.wordmark}>DropMic</Text>
      <View style={styles.rule} />
      <Text accessibilityRole="header" style={styles.title}>Analyzing Drop</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: 16, paddingVertical: 72 },
  wordmark: { color: colors.inkStrong, ...typography.displayMedium },
  rule: { backgroundColor: colors.coral, height: 4, width: 48 },
  title: { color: colors.ink, ...typography.title },
});
