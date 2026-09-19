import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { isCurrentTake } from './attempt-identity';
import { calculateDropScore } from './drop-score';
import { startQuickRead } from './quick-read-service';
import { compareTakeTwo } from './take-two-service';
import type { TakeTwoComparison } from '../../../supabase/functions/_shared/take-two';
import { getPlusDisplayEligibility, subscribeToPlusDisplaySession } from '@/features/billing/plus-display';
import type { QuickReadResult } from '../../../supabase/functions/_shared/quick-read-contract';

type QuickReadStep = 'consent' | 'processing' | 'result' | 'error';

export function QuickReadFlow({
  attemptId,
  audioExtension,
  audioUri,
  idempotencyKey,
  onClose,
  onTakeTwo,
  prompt,
  takeTwoBaselineRunId = null,
  takeId,
  visible,
}: {
  attemptId: string | null;
  audioExtension: 'm4a' | 'mp4' | 'webm' | 'wav' | 'ogg';
  audioUri: string | null;
  idempotencyKey: string;
  onClose: () => void;
  onTakeTwo?: (baselineRunId: string) => void;
  prompt?: string;
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
  const [error, setError] = useState<string | null>(null);
  const [stepTakeId, setStepTakeId] = useState(takeId);
  const activeTakeId = useRef(takeId);
  const requestGeneration = useRef(0);
  const runInFlight = useRef(false);
  const takeTwoInFlight = useRef(false);
  const onCloseRef = useRef(onClose);
  const sessionIdentity = useRef<{ initialized: boolean; userId: string | null }>({ initialized: false, userId: null });

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    activeTakeId.current = takeId;
    requestGeneration.current += 1;
    runInFlight.current = false;
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

  const close = () => {
    requestGeneration.current += 1;
    runInFlight.current = false;
    setStepTakeId(takeId);
    setStep('consent');
    setResult(null);
    setRunId(null);
    setComparison(null);
    setComparisonError(null);
    setError(null);
    setPlusEligible(false);
    onClose();
  };

  const run = async () => {
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
    setError(null);
    setStep('processing');
    try {
      const response = await startQuickRead({
        attemptId,
        audioUri,
        audioExtension,
        idempotencyKey,
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
          }
        });
      }
      setStep('result');
    } catch (runError) {
      if (requestGeneration.current !== requestId || !isCurrentTake(requestTakeId, activeTakeId.current)) {
        return;
      }
      runInFlight.current = false;
      setError(runError instanceof Error ? runError.message : "Quick Read couldn't finish.");
      setStep('error');
    }
  };

  const startTakeTwo = () => {
    if (!currentRunId || !onTakeTwo || takeTwoInFlight.current) {
      return;
    }
    takeTwoInFlight.current = true;
    requestGeneration.current += 1;
    onTakeTwo(currentRunId);
  };

  return (
    <Modal accessibilityViewIsModal animationType="slide" onRequestClose={close} transparent visible={visible}>
      <View style={styles.backdrop}>
        <ScrollView contentContainerStyle={styles.content} style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.kicker}>QUICK READ</Text>
            <Pressable accessibilityLabel="Close Quick Read" accessibilityRole="button" onPress={close} style={styles.close}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>

          {currentStep === 'consent' && (
            <>
              <Text accessibilityRole="header" style={styles.title}>Quick Read</Text>
              <Text style={styles.body}>Upload this recording for a brief, private analysis of clarity, structure, specificity, and concision.</Text>
              <View style={styles.notice}>
                <Text style={styles.noticeBody}>Your audio is sent securely for processing, deleted after successful analysis, and never added to your durable practice metrics.</Text>
                <Text style={styles.noticeBody}>The transcript is retained for up to 30 days. You can use up to 3 Quick Reads per day.</Text>
              </View>
              <FlowButton label="Upload & get my Quick Read" onPress={() => void run()} />
              <FlowButton label="Not now" onPress={close} secondary />
            </>
          )}

          {currentStep === 'processing' && (
            <View style={styles.center}>
              <Text style={styles.kicker}>PRIVATE PROCESSING</Text>
              <Text accessibilityRole="header" style={styles.title}>Listening for the useful part.</Text>
              <Text style={styles.body}>Transcribing, shaping the feedback, and deleting the cloud audio when the result is safely stored.</Text>
            </View>
          )}

          {currentStep === 'error' && (
            <>
              <Text accessibilityLabel="Quick Read paused safely." accessibilityRole="header" style={styles.title}>Quick Read paused safely.</Text>
              <Text style={styles.body}>{currentError ?? "Quick Read couldn't finish."}</Text>
              <FlowButton label="Try Quick Read again" onPress={() => void run()} />
              <FlowButton label="Close" onPress={close} secondary />
            </>
          )}

          {currentStep === 'result' && currentResult && (
            <>
              <Text accessibilityRole="header" style={styles.title}>Here’s your Quick Read.</Text>
              <Text style={styles.body}>A focused signal for the next take—not a verdict.</Text>
              <SpeakerVibeCard speakerVibe={currentResult.speakerVibe} />
              <View accessibilityLabel="Quick Read scores" style={styles.scoreGrid}>
                <Score label="Drop Score" value={calculateDropScore(currentResult)} />
                <Score label="Clarity" value={Math.round(currentResult.clarity * 100)} />
                <Score label="Structure" value={Math.round(currentResult.structure * 100)} locked={!plusEligible} />
                <Score label="Concision" value={Math.round(currentResult.concision * 100)} locked={!plusEligible} />
              </View>
              <FeedbackCard label="WHERE YOU SHINE" text={currentResult.strength} />
              <FeedbackCard label="WHERE YOU NEED WORK" text={currentResult.improvement} />
              <FeedbackCard label="DROP DRILL" text={currentResult.nextDrill} />
              <Text style={styles.retentionNote}>Cloud audio was deleted after analysis. Transcript retention is limited to 30 days.</Text>
              {!takeTwoBaselineRunId && plusEligible && currentRunId && (
                <View accessibilityLabel="Take Two invitation" style={styles.takeTwoCard} testID="take-two-cta">
                  <Text accessibilityRole="header" style={styles.takeTwoTitle}>Take Two</Text>
                  <Text style={styles.takeTwoBody}>Try the same prompt again and compare.</Text>
                  <FlowButton label="Take Two" onPress={startTakeTwo} />
                </View>
              )}
              {takeTwoBaselineRunId && (
                <TakeTwoComparisonView
                  comparison={currentComparison}
                  error={currentComparisonError}
                  prompt={prompt ?? 'Your original prompt'}
                />
              )}
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

function SpeakerVibeCard({ speakerVibe }: { speakerVibe?: QuickReadResult['speakerVibe'] }) {
  return (
    <View accessibilityLabel={`Speaker Vibe: ${speakerVibe ?? 'not available for this saved result'}`} style={styles.vibeCard}>
      <Text style={styles.vibeLabel}>SPEAKER VIBE</Text>
      <Text style={styles.vibeValue}>{speakerVibe ?? 'Not available for this saved result.'}</Text>
    </View>
  );
}

function Score({ label, value, locked = false }: { label: string; value: number; locked?: boolean }) {
  return (
    <View accessibilityLabel={locked ? `${label}: locked for free access` : `${label}: ${value} percent`} style={[styles.score, locked && styles.lockedScore]}>
      {locked ? (
        <Text style={styles.lockedValue}>Locked</Text>
      ) : (
        <View style={styles.scoreValueRow}>
          <Text style={styles.scoreValue}>{value}</Text>
          <Text style={styles.scoreUnit}>%</Text>
        </View>
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
  backdrop: { backgroundColor: 'rgba(24, 51, 45, 0.58)', flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fffaf2', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%' },
  content: { gap: 16, padding: 24, paddingBottom: 42 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  kicker: { color: '#e4572e', fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  close: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  closeText: { color: '#526c63', fontSize: 14, fontWeight: '700' },
  title: { color: '#18332d', fontFamily: 'Georgia', fontSize: 32, fontWeight: '700', lineHeight: 38 },
  body: { color: '#526c63', fontSize: 16, lineHeight: 24 },
  notice: { backgroundColor: '#f4ebdd', borderRadius: 14, gap: 8, padding: 16 },
  noticeTitle: { color: '#18332d', fontSize: 15, fontWeight: '900' },
  noticeBody: { color: '#526c63', fontSize: 14, lineHeight: 21 },
  center: { gap: 16, paddingVertical: 72 },
  scoreGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  score: { backgroundColor: '#e7dccb', borderColor: '#c4b5a2', borderRadius: 12, borderWidth: 1, flexGrow: 1, minWidth: '45%', padding: 14 },
  lockedScore: { backgroundColor: '#f4ebdd' },
  scoreValueRow: { alignItems: 'baseline', flexDirection: 'row', gap: 4 },
  scoreValue: { color: '#18332d', fontFamily: 'Georgia', fontSize: 30, fontWeight: '700' },
  scoreUnit: { color: '#799087', fontSize: 14, fontWeight: '900' },
  lockedValue: { color: '#799087', fontSize: 18, fontWeight: '900' },
  scoreLabel: { color: '#526c63', fontSize: 12, fontWeight: '800', marginTop: 8 },
  vibeCard: { backgroundColor: '#18332d', borderRadius: 14, gap: 6, padding: 16 },
  vibeLabel: { color: '#f4c3ac', fontSize: 10, fontWeight: '900', letterSpacing: 1.8 },
  vibeValue: { color: '#fffaf2', fontFamily: 'Georgia', fontSize: 24, fontWeight: '700', lineHeight: 30 },
  feedbackCard: { backgroundColor: '#f4ebdd', borderRadius: 14, gap: 8, padding: 16 },
  feedbackLabel: { color: '#e4572e', fontSize: 10, fontWeight: '900', letterSpacing: 1.8 },
  feedbackText: { color: '#18332d', fontFamily: 'Georgia', fontSize: 20, fontWeight: '600', lineHeight: 27 },
  retentionNote: { color: '#799087', fontSize: 12, lineHeight: 18 },
  takeTwoCard: { backgroundColor: '#e7dccb', borderColor: '#c4b5a2', borderRadius: 14, borderWidth: 1, gap: 10, padding: 16 },
  takeTwoTitle: { color: '#18332d', fontFamily: 'Georgia', fontSize: 26, fontWeight: '700', lineHeight: 32 },
  takeTwoBody: { color: '#526c63', fontSize: 15, lineHeight: 22 },
  comparison: { backgroundColor: '#fffaf2', borderColor: '#c4b5a2', borderRadius: 14, borderWidth: 1, gap: 10, padding: 16 },
  comparisonNotice: { backgroundColor: '#f8d8ca', borderRadius: 14, gap: 8, padding: 16 },
  comparisonLabel: { color: '#e4572e', fontSize: 10, fontWeight: '900', letterSpacing: 1.6 },
  comparisonPrompt: { color: '#18332d', fontFamily: 'Georgia', fontSize: 20, lineHeight: 27 },
  takeColumns: { flexDirection: 'row', gap: 10 },
  comparisonColumn: { backgroundColor: '#f4ebdd', borderRadius: 10, flex: 1, gap: 6, padding: 12 },
  comparisonColumnTitle: { color: '#18332d', fontSize: 14, fontWeight: '900', marginBottom: 3 },
  metricRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 28 },
  metricLabel: { color: '#526c63', flexShrink: 1, fontSize: 12 },
  metricValue: { color: '#18332d', fontSize: 13, fontWeight: '800', marginLeft: 8 },
  button: { alignItems: 'center', backgroundColor: '#e4572e', borderRadius: 12, justifyContent: 'center', minHeight: 54, paddingHorizontal: 16 },
  secondaryButton: { backgroundColor: 'transparent', borderColor: '#b9aa98', borderWidth: 1 },
  buttonText: { color: '#fffaf2', fontSize: 15, fontWeight: '900' },
  secondaryButtonText: { color: '#18332d' },
  disabled: { opacity: 0.45 },
});
