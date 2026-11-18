import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { isCurrentTake } from './attempt-identity';
import { calculateDropScore } from './drop-score';
import { startQuickRead } from './quick-read-service';
import { compareTakeTwo } from './take-two-service';
import type { TakeTwoComparison } from '../../../supabase/functions/_shared/take-two';
import { getPlusDisplayEligibility, subscribeToPlusDisplaySession } from '@/features/billing/plus-display';
import { trackEvent } from '@/features/analytics/analytics';
import { createChallenge } from '@/features/challenge/challenge-service';
import { shareDropCard } from '@/features/share/share-service';
import { ShareCard } from '@/features/share/ShareCard';
import { DropWait } from '@/ui/DropWait';
import { colors, radii, spacing, typography } from '@/ui/theme';
import type { QuickReadResult } from '../../../supabase/functions/_shared/quick-read-contract';
import { RUBRIC_ANCHORS, RUBRIC_DIMENSIONS, type RubricDimension } from '../../../supabase/functions/_shared/dropmic-rubric';

type QuickReadStep = 'consent' | 'processing' | 'result' | 'error';

export function QuickReadFlow({
  attemptId,
  autoStart = false,
  audioExtension,
  audioUri,
  idempotencyKey,
  onClose,
  onOpenPlus,
  onTakeTwo,
  prompt,
  reducedMotion = false,
  takeTwoBaselineRunId = null,
  takeId,
  visible,
}: {
  attemptId: string | null;
  autoStart?: boolean;
  audioExtension: 'm4a' | 'mp4' | 'webm' | 'wav' | 'ogg';
  audioUri: string | null;
  idempotencyKey: string;
  onClose: (options?: { preserveTakeTwoBaseline?: boolean }) => void;
  onOpenPlus?: () => void;
  onTakeTwo?: (baselineRunId: string) => void;
  prompt?: string;
  reducedMotion?: boolean;
  takeTwoBaselineRunId?: string | null;
  takeId: string;
  visible: boolean;
}) {
  const [step, setStep] = useState<QuickReadStep>('consent');
  const [result, setResult] = useState<QuickReadResult | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [comparison, setComparison] = useState<TakeTwoComparison | null>(null);
  const [comparisonError, setComparisonError] = useState<string | null>(null);
  const [plusEligible, setPlusEligible] = useState(false);
  const [plusEligibilityResolved, setPlusEligibilityResolved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [manualRetryUsed, setManualRetryUsed] = useState(false);
  const [manualRetryAvailable, setManualRetryAvailable] = useState(false);
  const [retryStatusUnknown, setRetryStatusUnknown] = useState(false);
  const [stepTakeId, setStepTakeId] = useState(takeId);
  const activeTakeId = useRef(takeId);
  const requestGeneration = useRef(0);
  const runInFlight = useRef(false);
  const autoStartHandled = useRef(false);
  const takeTwoInFlight = useRef(false);
  const shareInFlight = useRef(false);
  const onCloseRef = useRef(onClose);
  const sessionIdentity = useRef<{ initialized: boolean; userId: string | null }>({ initialized: false, userId: null });

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    activeTakeId.current = takeId;
    requestGeneration.current += 1;
    runInFlight.current = false;
    autoStartHandled.current = false;
    takeTwoInFlight.current = false;
    return () => {
      requestGeneration.current += 1;
      runInFlight.current = false;
    };
  }, [takeId]);

  useEffect(() => subscribeToPlusDisplaySession((userId) => {
    if (!sessionIdentity.current.initialized) {
      sessionIdentity.current = { initialized: true, userId };
      return;
    }
    if (sessionIdentity.current.userId === userId) {
      return;
    }
    sessionIdentity.current = { initialized: true, userId };
    requestGeneration.current += 1;
    runInFlight.current = false;
    takeTwoInFlight.current = false;
    setPlusEligible(false);
    setPlusEligibilityResolved(false);
    setComparison(null);
    setComparisonError(null);
    onCloseRef.current();
  }), []);

  const currentStep = stepTakeId === takeId ? step : 'consent';
  const currentResult = stepTakeId === takeId ? result : null;
  const currentError = stepTakeId === takeId ? error : null;
  const currentRunId = stepTakeId === takeId ? runId : null;
  const currentComparison = stepTakeId === takeId ? comparison : null;
  const currentComparisonError = stepTakeId === takeId ? comparisonError : null;
  const currentErrorCode = stepTakeId === takeId ? errorCode : null;
  const currentManualRetryUsed = stepTakeId === takeId ? manualRetryUsed : false;
  const currentManualRetryAvailable = stepTakeId === takeId ? manualRetryAvailable : false;
  const currentRetryStatusUnknown = stepTakeId === takeId ? retryStatusUnknown : false;

  const close = (preserveTakeTwoBaseline = Boolean(takeTwoBaselineRunId && (currentStep === 'error' || currentComparisonError))) => {
    requestGeneration.current += 1;
    runInFlight.current = false;
    setStepTakeId(takeId);
    setStep('consent');
    setResult(null);
    setRunId(null);
    setComparison(null);
    setComparisonError(null);
    setError(null);
    setErrorCode(null);
    setManualRetryUsed(false);
    setManualRetryAvailable(false);
    setRetryStatusUnknown(false);
    setPlusEligible(false);
    setPlusEligibilityResolved(false);
    onClose({ preserveTakeTwoBaseline });
  };

  const run = useCallback(async (retryFailed = false) => {
    if (runInFlight.current) {
      return;
    }
    if (!attemptId || !audioUri) {
      setError('The completed take is not ready for Quick Read.');
      setStep('error');
      return;
    }
    const requestTakeId = takeId;
    const requestId = ++requestGeneration.current;
    runInFlight.current = true;
    setStepTakeId(takeId);
    setResult(null);
    setRunId(null);
    setComparison(null);
    setComparisonError(null);
    setPlusEligible(false);
    setPlusEligibilityResolved(false);
    setError(null);
    setErrorCode(null);
    setManualRetryAvailable(false);
    setRetryStatusUnknown(false);
    if (!retryFailed) setManualRetryUsed(false);
    setStep('processing');
    void trackEvent('quick_read_requested', { dedupeKey: `quick-read-requested:${requestTakeId}` });
    try {
      const response = await startQuickRead({
        attemptId,
        audioUri,
        audioExtension,
        idempotencyKey,
        retryFailed,
      });
      if (requestGeneration.current !== requestId || !isCurrentTake(requestTakeId, activeTakeId.current)) {
        return;
      }
      runInFlight.current = false;
      setResult(response.result);
      setRunId(response.runId);
      if (takeTwoBaselineRunId) {
        try {
          const takeTwo = await compareTakeTwo({ baselineRunId: takeTwoBaselineRunId, followUpRunId: response.runId });
          if (requestGeneration.current !== requestId || !isCurrentTake(requestTakeId, activeTakeId.current)) {
            return;
          }
          setComparison(takeTwo);
          setComparisonError(null);
        } catch (comparisonFailure) {
          if (requestGeneration.current !== requestId || !isCurrentTake(requestTakeId, activeTakeId.current)) {
            return;
          }
          const message = comparisonFailure instanceof Error
            ? comparisonFailure.message
            : 'Take Two could not finish. Your Quick Read is saved.';
          setComparisonError(message);
        }
      } else {
        const eligibilityRequestId = requestGeneration.current;
        void getPlusDisplayEligibility().then((eligible) => {
          if (requestGeneration.current === eligibilityRequestId && isCurrentTake(requestTakeId, activeTakeId.current)) {
            setPlusEligible(eligible);
            setPlusEligibilityResolved(true);
          }
        }).catch(() => {
          if (requestGeneration.current === eligibilityRequestId && isCurrentTake(requestTakeId, activeTakeId.current)) {
            setPlusEligible(false);
            setPlusEligibilityResolved(true);
          }
        });
      }
      setStep('result');
      void trackEvent('quick_read_completed', { dedupeKey: `quick-read-completed:${requestTakeId}` });
    } catch (runError) {
      if (requestGeneration.current !== requestId || !isCurrentTake(requestTakeId, activeTakeId.current)) {
        return;
      }
      runInFlight.current = false;
      setError(runError instanceof Error ? runError.message : "Quick Read couldn't finish.");
      const candidateErrorCode = runError && typeof runError === 'object' && 'code' in runError
        ? (runError as { code?: unknown }).code
        : undefined;
      setErrorCode(typeof candidateErrorCode === 'string' ? candidateErrorCode : 'quick_read_failed');
      const retryAvailable = runError && typeof runError === 'object' && 'retryAvailable' in runError
        ? (runError as { retryAvailable?: unknown }).retryAvailable === true
        : false;
      setManualRetryAvailable(retryAvailable);
      const retryMayNeedStatusCheck = runError && typeof runError === 'object' && 'retryStatusUnknown' in runError
        ? (runError as { retryStatusUnknown?: unknown }).retryStatusUnknown === true
        : retryFailed && candidateErrorCode === 'processing';
      setRetryStatusUnknown(retryMayNeedStatusCheck);
      setStep('error');
      void trackEvent('quick_read_failed', { dedupeKey: `quick-read-failed:${requestTakeId}` });
    }
  }, [audioExtension, attemptId, audioUri, idempotencyKey, takeId, takeTwoBaselineRunId]);

  useEffect(() => {
    if (!visible) {
      autoStartHandled.current = false;
      return;
    }
    if (!autoStart || autoStartHandled.current) {
      return;
    }
    autoStartHandled.current = true;
    void run();
  }, [autoStart, run, visible]);

  const startTakeTwo = () => {
    if (!currentRunId || !onTakeTwo || takeTwoInFlight.current) {
      return;
    }
    takeTwoInFlight.current = true;
    requestGeneration.current += 1;
    onTakeTwo(currentRunId);
  };

  const shareResult = async () => {
    if (!currentResult || !prompt || shareInFlight.current) return;
    shareInFlight.current = true;
    try {
      if (!attemptId) {
        setError('Finish account setup before sharing this challenge.');
        return;
      }
      const challenge = await createChallenge({ attemptId, prompt, durationSeconds: 30 });
      await shareDropCard({
        challengeUrl: challenge.url,
        dropScore: calculateDropScore(currentResult),
        prompt,
      });
    } catch (shareError) {
      setError(shareError instanceof Error ? shareError.message : 'The share card could not be prepared.');
    } finally {
      shareInFlight.current = false;
    }
  };

  return (
    <Modal accessibilityViewIsModal animationType="slide" onRequestClose={() => close()} transparent visible={visible}>
      <View style={styles.backdrop}>
        <ScrollView contentContainerStyle={styles.content} style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.kicker}>QUICK READ</Text>
            <Pressable accessibilityLabel="Close Quick Read" accessibilityRole="button" onPress={() => close()} style={styles.close}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>

          {currentStep === 'consent' && (
            <>
              <Text accessibilityRole="header" style={styles.title}>Quick Read</Text>
              <Text style={styles.body}>Upload your Drop for a prompt-aware read of message effectiveness: Clarity, Structure, Specificity, and Concision. This same base score applies to Free and Plus. It does not assess voice, personality, or delivery. Cloud audio is deleted after analysis; your transcript stays private and is kept for up to 30 days.</Text>
              <FlowButton label="Upload & get my Quick Read" onPress={() => void run()} />
              <FlowButton label="Not now" onPress={close} secondary />
            </>
          )}

          {currentStep === 'processing' && (
            <DropWait reducedMotion={reducedMotion} />
          )}

          {currentStep === 'error' && (
            <>
              <Text accessibilityLabel={takeTwoBaselineRunId ? 'Second Quick Read paused safely.' : 'Quick Read paused safely.'} accessibilityRole="header" style={styles.title}>
                {takeTwoBaselineRunId ? 'Second Quick Read paused safely.' : 'Quick Read paused safely.'}
              </Text>
              <Text style={styles.body}>
                {takeTwoBaselineRunId
                  ? currentRetryStatusUnknown
                    ? 'We could not confirm whether the second Quick Read finished. Your second Drop and first read are still saved. Check the same run before doing anything else.'
                    : `Your second Drop is saved, but its Quick Read did not finish. Your first read is still saved. ${currentManualRetryUsed || currentErrorCode === 'retry_not_available' || !currentManualRetryAvailable ? 'This read cannot be retried right now.' : (currentError ?? 'Retry the second read to compare both takes.')}`
                  : currentError ?? "Quick Read couldn't finish."}
              </Text>
              {takeTwoBaselineRunId && currentRetryStatusUnknown && (
                <FlowButton label="Check Quick Read status" onPress={() => void run(true)} />
              )}
              {currentManualRetryAvailable && !currentManualRetryUsed && currentErrorCode !== 'retry_not_available' && (
                <FlowButton
                  label={takeTwoBaselineRunId ? 'Retry second Quick Read' : 'Try Quick Read again'}
                  onPress={() => {
                    setManualRetryUsed(true);
                    setManualRetryAvailable(false);
                    void run(true);
                  }}
                />
              )}
              {takeTwoBaselineRunId && !currentManualRetryAvailable && !currentRetryStatusUnknown && (
                <>
                  <Text style={styles.noticeBody}>This read can’t be retried. Keep both Drops; your first read is still saved.</Text>
                  <Text
                    accessibilityRole="link"
                    onPress={() => { void Linking.openURL('mailto:support@thedropmic.com?subject=Quick%20Read%20help'); }}
                    style={styles.supportLink}
                  >Contact support</Text>
                </>
              )}
              <FlowButton label={takeTwoBaselineRunId ? 'Keep both Drops' : 'Close'} onPress={() => close(Boolean(takeTwoBaselineRunId))} secondary />
            </>
          )}

          {currentStep === 'result' && currentResult && (
            <>
              <ShareCard dropScore={calculateDropScore(currentResult)} prompt={prompt ?? 'Your Drop'} />
              <View accessibilityLabel="Quick Read scores" style={styles.scoreGrid}>
                <Score label="Drop Score" value={calculateDropScore(currentResult)} reducedMotion={reducedMotion} />
                <Score label="Clarity" value={Math.round(currentResult.clarity * 100)} reducedMotion={reducedMotion} />
                <Score label="Structure" value={Math.round(currentResult.structure * 100)} reducedMotion={reducedMotion} />
                <Score label="Specificity" value={Math.round(currentResult.specificity * 100)} reducedMotion={reducedMotion} />
                <Score label="Concision" value={Math.round(currentResult.concision * 100)} reducedMotion={reducedMotion} />
              </View>
              <Text style={styles.scoreDefinition}>Drop Score reflects how this take communicated its message for the prompt and time. It does not rate your voice or personality.</Text>
              {currentResult.taskMet === false && <Text accessibilityRole="alert" style={styles.taskNotMet}>Task not met. Your dimension feedback is shown without an overall score.</Text>}
              <FeedbackCard label="WHERE YOU SHINE" text={currentResult.strength} />
              <FeedbackCard label="WHERE YOU NEED WORK" text={currentResult.improvement} />
              <FeedbackCard label="DROP DRILL" text={currentResult.nextDrill} />
              {plusEligible && currentResult.rubricEvidence && currentResult.rubricScores && (
                <RubricEvidenceBreakdown evidence={currentResult.rubricEvidence} scores={currentResult.rubricScores} />
              )}
              {plusEligible && currentResult.rubricVersion && !currentResult.rubricEvidence && (
                <FeedbackCard label="PLUS SCORE DETAILS" text="This saved read predates evidence-backed scoring details. New Quick Reads can show the exact moments behind each rubric judgment." />
              )}
              {!plusEligible && onOpenPlus && <FlowButton label="Unlock full Quick Read with Plus" onPress={onOpenPlus} secondary />}
              {!takeTwoBaselineRunId && currentRunId && plusEligibilityResolved && (plusEligible ? (
                <View accessibilityLabel="Take Two invitation" style={styles.takeTwoCard} testID="take-two-cta">
                  <Text accessibilityRole="header" style={styles.takeTwoTitle}>Take Two</Text>
                  <Text style={styles.takeTwoBody}>Try the same prompt again and compare.</Text>
                  <FlowButton label="Take Two" onPress={startTakeTwo} />
                </View>
              ) : (
                <View accessibilityLabel="Take Two locked for Plus" style={styles.takeTwoCard} testID="take-two-locked">
                  <Text accessibilityRole="header" style={styles.takeTwoTitle}>Take Two</Text>
                  <Text style={styles.takeTwoBody}>Try the same prompt again and compare both takes with DropMic Plus.</Text>
                  {onOpenPlus && <FlowButton label="Unlock Take Two with Plus" onPress={onOpenPlus} secondary />}
                </View>
              ))}
              {takeTwoBaselineRunId && (
                <TakeTwoComparisonView
                  comparison={currentComparison}
                  error={currentComparisonError}
                  prompt={prompt ?? 'Your original prompt'}
                />
              )}
              <FlowButton label="Share Result + Challenge" onPress={() => void shareResult()} secondary />
              <FlowButton label="Done" onPress={close} />
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function TakeTwoComparisonView({
  comparison,
  error,
  prompt,
}: {
  comparison: TakeTwoComparison | null;
  error: string | null;
  prompt: string;
}) {
  if (error || !comparison) {
    return (
      <View accessibilityLabel="Take Two comparison unavailable" style={styles.comparisonNotice}>
        <Text style={styles.noticeTitle}>Take Two comparison unavailable</Text>
        <Text accessibilityLiveRegion="polite" style={styles.noticeBody}>{error ?? 'Your completed Quick Read is saved.'}</Text>
      </View>
    );
  }

  return (
    <View accessibilityLabel="Take Two comparison" style={styles.comparison} testID="take-two-comparison">
      <Text accessibilityRole="header" style={styles.takeTwoTitle}>Take Two</Text>
      <Text style={styles.comparisonLabel}>ORIGINAL PROMPT</Text>
      <Text style={styles.comparisonPrompt}>{prompt}</Text>
      <View style={styles.takeColumns}>
        <ComparisonColumn label="First Take" snapshot={comparison.baseline} />
        <ComparisonColumn label="Second Take" snapshot={comparison.followUp} />
      </View>
      <Text style={styles.comparisonLabel}>RAW DELTAS · SECOND − FIRST</Text>
      <MetricRow label="Clarity" value={comparison.deltas.scores.clarity} />
      <MetricRow label="Structure" value={comparison.deltas.scores.structure} />
      <MetricRow label="Specificity" value={comparison.deltas.scores.specificity} />
      <MetricRow label="Concision" value={comparison.deltas.scores.concision} />
      <MetricRow label="Words" value={comparison.deltas.metrics.wordCount} />
      <MetricRow label="Words per minute" value={comparison.deltas.metrics.wordsPerMinute} />
      <MetricRow label="Filler words" value={comparison.deltas.metrics.fillerWordCount} />
    </View>
  );
}

function ComparisonColumn({
  label,
  snapshot,
}: {
  label: string;
  snapshot: TakeTwoComparison['baseline'];
}) {
  return (
    <View accessibilityLabel={`${label} scores and metrics`} style={styles.comparisonColumn}>
      <Text style={styles.comparisonColumnTitle}>{label}</Text>
      <MetricRow label="Clarity" value={snapshot.scores.clarity} />
      <MetricRow label="Structure" value={snapshot.scores.structure} />
      <MetricRow label="Specificity" value={snapshot.scores.specificity} />
      <MetricRow label="Concision" value={snapshot.scores.concision} />
      <MetricRow label="Words" value={snapshot.metrics.wordCount} />
      <MetricRow label="Words per minute" value={snapshot.metrics.wordsPerMinute} />
      <MetricRow label="Filler words" value={snapshot.metrics.fillerWordCount} />
    </View>
  );
}

function MetricRow({ label, value }: { label: string; value: number }) {
  return (
    <View accessibilityLabel={`${label}: ${value}`} style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function RubricEvidenceBreakdown({
  evidence,
  scores,
}: {
  evidence: NonNullable<QuickReadResult['rubricEvidence']>;
  scores: NonNullable<QuickReadResult['rubricScores']>;
}) {
  return (
    <View accessibilityLabel="Plus score details with transcript evidence" style={styles.evidenceSection} testID="plus-rubric-evidence">
      <Text accessibilityRole="header" style={styles.evidenceTitle}>PLUS SCORE DETAILS</Text>
      <Text style={styles.evidenceIntro}>The score stays the same. Here are the specific moments and rubric checks behind it.</Text>
      {(Object.keys(RUBRIC_DIMENSIONS) as RubricDimension[]).map((dimension) => {
        const criterionIds = RUBRIC_DIMENSIONS[dimension];
        const earned = criterionIds.reduce((sum, id) => sum + scores[id], 0);
        return (
          <View key={dimension} style={styles.evidenceDimension}>
            <View style={styles.evidenceDimensionHeading}>
              <Text style={styles.evidenceDimensionTitle}>{dimension[0].toUpperCase() + dimension.slice(1)}</Text>
              <Text style={styles.evidencePoints}>{earned}/8</Text>
            </View>
            {criterionIds.map((id) => (
              <View key={id} style={styles.evidenceItem} testID={`rubric-evidence-${id}`}>
                <View style={styles.evidenceItemHeading}>
                  <Text style={styles.evidenceCriterion}>{RUBRIC_ANCHORS[id].name}</Text>
                  <Text style={styles.evidenceScore}>{scores[id]}/2</Text>
                </View>
                <Text style={styles.evidenceExcerpt}>“{evidence[id].excerpt}”</Text>
                <Text style={styles.evidenceRationale}>{evidence[id].rationale}</Text>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

function Score({ label, value, reducedMotion }: { label: string; value: number | null; reducedMotion: boolean }) {
  const [progress] = useState(() => new Animated.Value(0));
  const [animatedValue, setAnimatedValue] = useState(0);
  const displayedValue = reducedMotion || value === null ? value : animatedValue;

  useEffect(() => {
    progress.stopAnimation();
    progress.setValue(reducedMotion || value === null ? value ?? 0 : 0);
    if (reducedMotion || value === null) return;

    const listenerId = progress.addListener(({ value: current }) => setAnimatedValue(Math.round(current)));
    const animation = Animated.timing(progress, { duration: 720, toValue: value, useNativeDriver: false });
    animation.start();
    return () => {
      animation.stop();
      progress.removeListener(listenerId);
    };
  }, [progress, reducedMotion, value]);

  return (
    <View accessibilityLabel={value === null ? `${label}: unavailable because the task was not met` : `${label}: ${value} percent`} style={styles.score}>
      {value === null ? (
        <Text style={styles.lockedValue}>—</Text>
      ) : (
        <>
          <View style={styles.scoreValueRow}>
            <Text style={styles.scoreValue}>{displayedValue}</Text>
            <Text style={styles.scoreUnit}>%</Text>
          </View>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.scoreTrack}>
          <Animated.View style={[styles.scoreFill, { width: progress.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'], extrapolate: 'clamp' }) }]} />
          </View>
        </>
      )}
      <Text style={styles.scoreLabel}>{label}</Text>
    </View>
  );
}

function FeedbackCard({ label, text }: { label: string; text: string }) {
  return (
    <View style={styles.feedbackCard}>
      <Text style={styles.feedbackLabel}>{label}</Text>
      <Text style={styles.feedbackText}>{text}</Text>
    </View>
  );
}

function FlowButton({ disabled = false, label, onPress, secondary = false }: { disabled?: boolean; label: string; onPress: () => void; secondary?: boolean }) {
  return (
    <Pressable accessibilityLabel={label} accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[styles.button, secondary && styles.secondaryButton, disabled && styles.disabled]}>
      <Text style={[styles.buttonText, secondary && styles.secondaryButtonText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: colors.overlay, flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, maxHeight: '92%' },
  content: { gap: spacing.lg, padding: spacing.xxl, paddingBottom: spacing.jumbo + spacing.xs },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  kicker: { color: colors.coral, ...typography.eyebrow },
  close: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.xs },
  closeText: { color: colors.muted, ...typography.label },
  title: { color: colors.ink, fontFamily: typography.displayFamily, ...typography.displayMedium },
  body: { color: colors.muted, ...typography.body },
  notice: { backgroundColor: colors.surfaceMuted, borderRadius: radii.md, gap: spacing.sm, padding: spacing.lg },
  noticeTitle: { color: colors.ink, ...typography.label },
  noticeBody: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  supportLink: { color: colors.coral, fontSize: 15, fontWeight: '800', minHeight: 44, paddingVertical: spacing.sm, textDecorationLine: 'underline' },
  center: { gap: spacing.lg, paddingVertical: spacing.jumbo * 1.8 },
  scoreGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  score: { backgroundColor: colors.surfaceMuted, borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, flexGrow: 1, minWidth: '45%', padding: spacing.md },
  scoreValueRow: { alignItems: 'baseline', flexDirection: 'row', gap: 4 },
  scoreValue: { color: colors.ink, fontFamily: typography.displayFamily, fontSize: 30, fontWeight: '700' },
  scoreUnit: { color: colors.muted, fontSize: 14, fontWeight: '900' },
  lockedValue: { color: colors.muted, fontSize: 18, fontWeight: '900' },
  scoreLabel: { color: colors.muted, fontSize: 12, fontWeight: '800', marginTop: spacing.sm },
  taskNotMet: { color: colors.danger, fontSize: 14, fontWeight: '700', lineHeight: 21 },
  scoreDefinition: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  scoreTrack: { backgroundColor: colors.boardRail, borderRadius: radii.sm, height: 7, marginTop: spacing.md, overflow: 'hidden' },
  scoreFill: { backgroundColor: colors.coral, borderRadius: radii.sm, height: '100%' },
  feedbackCard: { backgroundColor: colors.surfaceMuted, borderRadius: radii.md, gap: spacing.sm, padding: spacing.lg },
  feedbackLabel: { color: colors.coral, ...typography.eyebrow },
  feedbackText: { color: colors.ink, fontFamily: typography.displayFamily, fontSize: 20, fontWeight: '600', lineHeight: 27 },
  evidenceSection: { backgroundColor: colors.surfaceMuted, borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, gap: spacing.md, padding: spacing.lg },
  evidenceTitle: { color: colors.coral, ...typography.eyebrow },
  evidenceIntro: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  evidenceDimension: { backgroundColor: colors.surface, borderRadius: radii.sm, gap: spacing.sm, padding: spacing.md },
  evidenceDimensionHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  evidenceDimensionTitle: { color: colors.ink, fontFamily: typography.displayFamily, fontSize: 20, fontWeight: '700' },
  evidencePoints: { color: colors.muted, fontSize: 14, fontWeight: '800' },
  evidenceItem: { borderTopColor: colors.surfaceMuted, borderTopWidth: 1, gap: spacing.xs, paddingTop: spacing.sm },
  evidenceItemHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  evidenceCriterion: { color: colors.ink, flexShrink: 1, fontSize: 14, fontWeight: '800' },
  evidenceScore: { color: colors.muted, fontSize: 13, fontWeight: '900', marginLeft: spacing.sm },
  evidenceExcerpt: { color: colors.ink, fontFamily: typography.displayFamily, fontSize: 15, lineHeight: 21 },
  evidenceRationale: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  takeTwoCard: { backgroundColor: colors.surfaceMuted, borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, gap: spacing.sm + spacing.xs, padding: spacing.lg },
  takeTwoTitle: { color: colors.ink, fontFamily: typography.displayFamily, fontSize: 26, fontWeight: '700', lineHeight: 32 },
  takeTwoBody: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  comparison: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, gap: spacing.sm + spacing.xs, padding: spacing.lg },
  comparisonNotice: { backgroundColor: colors.dangerSoft, borderRadius: radii.md, gap: spacing.sm, padding: spacing.lg },
  comparisonLabel: { color: colors.coral, ...typography.eyebrow },
  comparisonPrompt: { color: colors.ink, fontFamily: typography.displayFamily, fontSize: 20, lineHeight: 27 },
  takeColumns: { flexDirection: 'row', gap: 10 },
  comparisonColumn: { backgroundColor: colors.surfaceMuted, borderRadius: radii.sm, flex: 1, gap: spacing.xs + 2, padding: spacing.md },
  comparisonColumnTitle: { color: colors.ink, fontSize: 14, fontWeight: '900', marginBottom: 3 },
  metricRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 28 },
  metricLabel: { color: colors.muted, flexShrink: 1, fontSize: 12 },
  metricValue: { color: colors.ink, fontSize: 13, fontWeight: '800', marginLeft: spacing.sm },
  button: { alignItems: 'center', backgroundColor: colors.coral, borderRadius: radii.md, justifyContent: 'center', minHeight: 54, paddingHorizontal: spacing.lg },
  secondaryButton: { backgroundColor: 'transparent', borderColor: colors.border, borderWidth: 1 },
  buttonText: { color: colors.white, fontSize: 15, fontWeight: '900' },
  secondaryButtonText: { color: colors.ink },
  disabled: { opacity: 0.45 },
});
