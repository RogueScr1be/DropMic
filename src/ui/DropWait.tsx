import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { colors, typography } from './theme';

export function DropWait({ reducedMotion }: { reducedMotion: boolean }) {
  const [dropY] = useState(() => new Animated.Value(0));
  const [fill] = useState(() => new Animated.Value(0.35));

  useEffect(() => {
    dropY.stopAnimation();
    fill.stopAnimation();
    if (reducedMotion) {
      dropY.setValue(0);
      fill.setValue(0.55);
      return;
    }

    const animation = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(dropY, { duration: 560, toValue: 35, useNativeDriver: true }),
          Animated.timing(dropY, { duration: 0, toValue: 0, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.delay(360),
          Animated.timing(fill, { duration: 300, toValue: 0.78, useNativeDriver: true }),
          Animated.timing(fill, { duration: 300, toValue: 0.35, useNativeDriver: true }),
        ]),
      ]),
    );
    animation.start();
    return () => {
      animation.stop();
      dropY.stopAnimation();
      fill.stopAnimation();
    };
  }, [dropY, fill, reducedMotion]);

  return (
    <View accessibilityLabel="Analyzing Drop" style={styles.container} testID="drop-wait">
      <Text style={styles.wordmark}>DropMic</Text>
      <View accessibilityElementsHidden style={styles.dropScene}>
        <Animated.View style={[styles.drop, { transform: [{ translateY: dropY }] }]} />
        <View style={styles.bucket}>
          <Animated.View style={[styles.fill, { transform: [{ scaleY: fill }] }]} />
        </View>
      </View>
      <Text accessibilityRole="header" style={styles.title}>Analyzing Drop</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', gap: 16, paddingVertical: 72 },
  wordmark: { color: colors.inkStrong, ...typography.displayMedium },
  dropScene: { alignItems: 'center', height: 78, justifyContent: 'flex-end', position: 'relative', width: 96 },
  drop: { backgroundColor: colors.coral, borderRadius: 8, height: 16, position: 'absolute', top: 3, width: 16, zIndex: 1 },
  bucket: { borderColor: colors.ink, borderBottomLeftRadius: 16, borderBottomRightRadius: 16, borderBottomWidth: 4, borderLeftWidth: 4, borderRightWidth: 4, height: 46, justifyContent: 'flex-end', overflow: 'hidden', width: 64 },
  fill: { backgroundColor: colors.coralSoft, height: '100%' },
  title: { color: colors.ink, ...typography.title },
});
