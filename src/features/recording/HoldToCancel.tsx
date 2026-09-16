import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '@/ui/theme';

export const HOLD_TO_CANCEL_MS = 1_500;

type HoldToCancelProps = {
  disabled?: boolean;
  onCancel: () => void;
  onHoldStart?: () => void;
  onHoldRelease?: () => void;
  reducedMotion: boolean;
};

export function HoldToCancel({
  disabled = false,
  onCancel,
  onHoldRelease,
  onHoldStart,
  reducedMotion,
}: HoldToCancelProps) {
  const [holding, setHolding] = useState(false);
  const [progress, setProgress] = useState(0);
  const startedAt = useRef<number | null>(null);
  const cancelFired = useRef(false);
  const gestureActive = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearHold = (resetCancellation = true) => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
    startedAt.current = null;
    gestureActive.current = false;
    if (resetCancellation) {
      cancelFired.current = false;
    }
    setHolding(false);
    setProgress(0);
  };

  const finishCancel = () => {
    if (cancelFired.current || disabled) {
      return;
    }
    cancelFired.current = true;
    clearHold(false);
    onCancel();
  };

  const beginHold = () => {
    if (disabled || gestureActive.current || cancelFired.current) {
      return;
    }
    gestureActive.current = true;
    startedAt.current = Date.now();
    cancelFired.current = false;
    setHolding(true);
    setProgress(0);
    onHoldStart?.();
    timer.current = setInterval(() => {
      if (startedAt.current === null) {
        return;
      }
      const nextProgress = Math.min(1, (Date.now() - startedAt.current) / HOLD_TO_CANCEL_MS);
      if (!reducedMotion) {
        setProgress(nextProgress);
      }
      if (nextProgress >= 1) {
        finishCancel();
      }
    }, 50);
  };

  const releaseHold = () => {
    if (!gestureActive.current || cancelFired.current) {
      return;
    }
    clearHold();
    onHoldRelease?.();
  };

  useEffect(() => {
    if (disabled && gestureActive.current && !cancelFired.current) {
      clearHold();
    }
  }, [disabled]);

  useEffect(() => () => clearHold(false), []);

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityHint="Hold for 1.5 seconds to cancel and delete the current Drop"
        accessibilityLabel="Hold to Cancel"
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPressIn={beginHold}
        onPressOut={releaseHold}
        onResponderTerminate={releaseHold}
        style={[styles.holdButton, holding && styles.holdingButton, disabled && styles.disabled]}
        testID="hold-to-cancel">
        <Text style={styles.holdLabel}>{holding ? 'Keep holding to cancel' : 'Hold to Cancel'}</Text>
        <View style={styles.track}>
          <View
            style={[styles.progress, reducedMotion && styles.progressReducedMotion, { width: `${Math.round(progress * 100)}%` }]}
            testID="hold-to-cancel-progress"
          />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'stretch', gap: spacing.md, width: '100%' },
  holdButton: {
    alignItems: 'center',
    borderColor: colors.danger,
    borderRadius: radii.pill,
    borderWidth: 1,
    gap: spacing.sm,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  holdingButton: { backgroundColor: colors.dangerSoft },
  holdLabel: { color: colors.danger, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  track: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radii.pill,
    height: 6,
    overflow: 'hidden',
    width: '100%',
  },
  progress: { backgroundColor: colors.danger, height: '100%' },
  progressReducedMotion: { opacity: 0 },
  disabled: { opacity: 0.5 },
});
