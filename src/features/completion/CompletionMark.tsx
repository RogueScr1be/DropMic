import { useEffect, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';

import { colors, radii } from '@/ui/theme';

export function CompletionMark({ reducedMotion }: { reducedMotion: boolean }) {
  const [circleOpacity] = useState(() => new Animated.Value(reducedMotion ? 1 : 0));
  const [checkOpacity] = useState(() => new Animated.Value(reducedMotion ? 1 : 0));
  const [checkScale] = useState(() => new Animated.Value(reducedMotion ? 1 : 0.7));

  useEffect(() => {
    if (reducedMotion) {
      circleOpacity.setValue(1);
      checkOpacity.setValue(1);
      checkScale.setValue(1);
      return;
    }
    circleOpacity.setValue(0);
    checkOpacity.setValue(0);
    checkScale.setValue(0.7);
    const circleAnimation = Animated.timing(circleOpacity, { duration: 140, toValue: 1, useNativeDriver: true });
    const checkAnimation = Animated.parallel([
      Animated.timing(checkOpacity, { delay: 70, duration: 150, toValue: 1, useNativeDriver: true }),
      Animated.timing(checkScale, { delay: 70, duration: 150, toValue: 1, useNativeDriver: true }),
    ]);
    circleAnimation.start();
    checkAnimation.start();
    return () => {
      circleAnimation.stop();
      checkAnimation.stop();
    };
  }, [checkOpacity, checkScale, circleOpacity, reducedMotion]);

  return (
    <Animated.View testID="completion-mark" style={[styles.completionMark, { opacity: circleOpacity }]}>
      <Animated.Text
        testID="completion-mark-check"
        style={[styles.completionMarkText, !reducedMotion && { opacity: checkOpacity, transform: [{ scale: checkScale }] }]}>✓</Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  completionMark: { alignItems: 'center', backgroundColor: colors.ink, borderRadius: radii.pill, height: 82, justifyContent: 'center', width: 82 },
  completionMarkText: { color: colors.successSoft, fontSize: 48, fontWeight: '300' },
});
