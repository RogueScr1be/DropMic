import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { isCurrentTake } from './attempt-identity';
import { startQuickRead } from './quick-read-service';
import type { QuickReadResult } from '../../../supabase/functions/_shared/quick-read-contract';

type QuickReadStep = 'consent' | 'processing' | 'result' | 'error';

export function QuickReadFlow({
  attemptId,
  audioExtension,
  audioUri,
  idempotencyKey,
  onClose,
  takeId,
  visible,
}: {
  attemptId: string | null;
  audioExtension: 'm4a' | 'mp4' | 'webm' | 'wav' | 'ogg';
  audioUri: string | null;
  idempotencyKey: string;
  onClose: () => void;
  takeId: string;
  visible: boolean;
}) {
  const [step, setStep] = useState<QuickReadStep>('consent');
  const [result, setResult] = useState<QuickReadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stepTakeId, setStepTakeId] = useState(takeId);
  const activeTakeId = useRef(takeId);
  const requestGeneration = useRef(0);
  const runInFlight = useRef(false);

  useEffect(() => {
    activeTakeId.current = takeId;
    requestGeneration.current += 1;
    runInFlight.current = false;
    return () => {
      requestGeneration.current += 1;
      runInFlight.current = false;
    };
  }, [takeId]);

  const currentStep = stepTakeId === takeId ? step : 'consent';
  const currentResult = stepTakeId === takeId ? result : null;
  const currentError = stepTakeId === takeId ? error : null;

  const close = () => {
    requestGeneration.current += 1;
    runInFlight.current = false;
    setStepTakeId(takeId);
    setStep('consent');
    setResult(null);
    setError(null);
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
              <Text accessibilityRole="header" style={styles.title}>A short read on your take.</Text>
              <Text style={styles.body}>Upload this recording for a brief, private analysis of clarity, structure, specificity, and concision.</Text>
              <View style={styles.notice}>
                <Text style={styles.noticeTitle}>What happens next</Text>
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
              <Text accessibilityRole="header" style={styles.title}>Quick Read paused safely.</Text>
              <Text style={styles.body}>{currentError ?? "Quick Read couldn't finish."}</Text>
              <FlowButton label="Try Quick Read again" onPress={() => void run()} />
              <FlowButton label="Close" onPress={close} secondary />
            </>
          )}

          {currentStep === 'result' && currentResult && (
            <>
              <Text accessibilityRole="header" style={styles.title}>Here’s your Quick Read.</Text>
              <Text style={styles.body}>A focused signal for the next take—not a verdict.</Text>
              <View accessibilityLabel="Quick Read scores" style={styles.scoreGrid}>
                <Score label="Clarity" value={currentResult.clarity} />
                <Score label="Structure" value={currentResult.structure} />
                <Score label="Specificity" value={currentResult.specificity} />
                <Score label="Concision" value={currentResult.concision} />
              </View>
              <FeedbackCard label="ONE STRENGTH" text={currentResult.strength} />
              <FeedbackCard label="ONE FIX" text={currentResult.improvement} />
              <FeedbackCard label="NEXT DRILL" text={currentResult.nextDrill} />
              <Text style={styles.retentionNote}>Cloud audio was deleted after analysis. Transcript retention is limited to 30 days.</Text>
              <FlowButton label="Done" onPress={close} />
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

function Score({ label, value }: { label: string; value: number }) {
  return (
    <View accessibilityLabel={label + ': ' + Math.round(value * 100) + ' percent'} style={styles.score}>
      <Text style={styles.scoreValue}>{Math.round(value * 100)}</Text>
      <Text style={styles.scoreUnit}>%</Text>
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
  scoreValue: { color: '#18332d', fontFamily: 'Georgia', fontSize: 30, fontWeight: '700' },
  scoreUnit: { color: '#799087', fontSize: 11, fontWeight: '900', marginTop: -8 },
  scoreLabel: { color: '#526c63', fontSize: 12, fontWeight: '800', marginTop: 8 },
  feedbackCard: { backgroundColor: '#f4ebdd', borderRadius: 14, gap: 8, padding: 16 },
  feedbackLabel: { color: '#e4572e', fontSize: 10, fontWeight: '900', letterSpacing: 1.8 },
  feedbackText: { color: '#18332d', fontFamily: 'Georgia', fontSize: 20, lineHeight: 27 },
  retentionNote: { color: '#799087', fontSize: 12, lineHeight: 18 },
  button: { alignItems: 'center', backgroundColor: '#e4572e', borderRadius: 12, justifyContent: 'center', minHeight: 54, paddingHorizontal: 16 },
  secondaryButton: { backgroundColor: 'transparent', borderColor: '#b9aa98', borderWidth: 1 },
  buttonText: { color: '#fffaf2', fontSize: 15, fontWeight: '900' },
  secondaryButtonText: { color: '#18332d' },
  disabled: { opacity: 0.45 },
});
