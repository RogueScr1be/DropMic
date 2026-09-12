import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, minimumTouchTarget, radii, spacing, typography } from '@/ui/theme';

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
  const [confirming, setConfirming] = useState(false);
  const [progress, setProgress] = useState(0);
  const startedAt = useRef<number | null>(null);
  const cancelFired = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearHold = (updateState = true) => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
    startedAt.current = null;
    cancelFired.current = false;
    if (updateState) {
      setHolding(false);
      setProgress(0);
    }
  };

  const finishCancel = () => {
    if (cancelFired.current || disabled) {
      return;
    }
    cancelFired.current = true;
    setConfirming(false);
    setProgress(1);
    onCancel();
  };

  const beginHold = () => {
    if (disabled || holding) {
      return;
    }
    setConfirming(false);
    startedAt.current = Date.now();
    cancelFired.current = false;
    setHolding(true);
    setProgress(reducedMotion ? 1 : 0);
    onHoldStart?.();
    timer.current = setInterval(() => {
      if (startedAt.current === null) {
        return;
      }
      const nextProgress = Math.min(1, (Date.now() - startedAt.current) / HOLD_TO_CANCEL_MS);
      setProgress(nextProgress);
      if (nextProgress >= 1) {
        finishCancel();
      }
    }, 50);
  };

  const releaseHold = () => {
    if (!holding || cancelFired.current) {
      return;
    }
    clearHold();
    onHoldRelease?.();
  };

  const openConfirmation = () => {
    if (disabled || confirming) {
      return;
    }
    setConfirming(true);
  };

  const keepRecording = () => {
    if (disabled) {
      return;
    }
    setConfirming(false);
  };

  useEffect(() => () => clearHold(false), []);

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityHint="Hold continuously to delete this in-progress recording"
        accessibilityLabel="Hold to cancel recording"
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPressIn={beginHold}
        onPressOut={releaseHold}
        style={[styles.holdButton, disabled && styles.disabled]}
        testID="hold-to-cancel">
        <Text style={styles.holdLabel}>{holding ? 'Keep holding to cancel' : 'Hold to Cancel'}</Text>
        <View style={styles.track}>
          <View style={[styles.progress, { width: `${Math.round(progress * 100)}%` }]} testID="hold-to-cancel-progress" />
        </View>
      </Pressable>
      <Pressable
        accessibilityHint="Deletes this in-progress recording without a hold gesture"
        accessibilityLabel="Confirm cancel recording"
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={openConfirmation}
        style={[styles.confirmButton, disabled && styles.disabled]}
        testID="confirm-cancel-recording">
        <Text style={styles.confirmLabel}>Confirm Cancel</Text>
      </Pressable>
      {confirming && (
        <View
          accessibilityLabel="Cancel recording confirmation"
          style={styles.confirmation}
          testID="cancel-recording-confirmation">
          <Text accessibilityRole="header" maxFontSizeMultiplier={1.5} style={styles.confirmationTitle}>
            Cancel this recording?
          </Text>
          <Text maxFontSizeMultiplier={1.5} style={styles.confirmationBody}>
            The local recording will be deleted from this device.
          </Text>
          <Pressable
            accessibilityHint="Returns to the paused recording without deleting it"
            accessibilityLabel="Keep Recording"
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={keepRecording}
            style={[styles.keepButton, disabled && styles.disabled]}
            testID="keep-recording">
            <Text maxFontSizeMultiplier={1.5} style={styles.keepLabel}>Keep Recording</Text>
          </Pressable>
          <Pressable
            accessibilityHint="Deletes this local recording and returns to duration selection"
            accessibilityLabel="Delete Recording"
            accessibilityRole="button"
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={finishCancel}
            style={[styles.deleteButton, disabled && styles.disabled]}
            testID="delete-recording-confirmed">
            <Text maxFontSizeMultiplier={1.5} style={styles.deleteLabel}>Delete Recording</Text>
          </Pressable>
        </View>
      )}
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
  holdLabel: { color: colors.danger, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  track: {
    backgroundColor: colors.dangerSoft,
    borderRadius: radii.pill,
    height: 6,
    overflow: 'hidden',
    width: '100%',
  },
  progress: { backgroundColor: colors.danger, height: '100%' },
  confirmButton: { alignItems: 'center', justifyContent: 'center', minHeight: minimumTouchTarget },
  confirmLabel: { color: colors.danger, textAlign: 'center', ...typography.eyebrow },
  confirmation: {
    backgroundColor: colors.surface,
    borderColor: colors.dangerSoft,
    borderRadius: radii.lg,
    borderWidth: 1,
    gap: spacing.md,
    padding: spacing.lg,
    width: '100%',
  },
  confirmationTitle: { color: colors.inkStrong, textAlign: 'center', ...typography.title },
  confirmationBody: { color: colors.muted, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  keepButton: {
    alignItems: 'center',
    borderColor: colors.border,
    borderRadius: radii.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: minimumTouchTarget,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  keepLabel: { color: colors.ink, textAlign: 'center', ...typography.label },
  deleteButton: {
    alignItems: 'center',
    backgroundColor: colors.danger,
    borderColor: colors.danger,
    borderRadius: radii.md,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: minimumTouchTarget,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  deleteLabel: { color: colors.white, textAlign: 'center', ...typography.label },
  disabled: { opacity: 0.5 },
});
