import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuthFlowStore } from './auth-flow-store';
import { authFlowResumeStep, clearPendingAuth, getPendingAuth } from './auth-recovery';
import {
  AuthServiceError,
  beginEmailConversion,
  beginEmailSignIn,
  claimUnclaimedAttempt,
  deleteAccount,
  getSession,
  saveOnboarding,
  signOut,
  verifyEmailConversion,
  verifyEmailSignIn,
} from './auth-service';
import { SPEAKING_BLOCKERS, SPEAKING_GOALS } from '@/features/onboarding/onboarding-options';
import type { UnclaimedAttempt } from './auth-recovery';

export function SignupFlow({
  attempt,
  onClose,
  onSignedOut,
  visible,
}: {
  attempt: UnclaimedAttempt | null;
  onClose: () => void;
  onSignedOut: () => void;
  visible: boolean;
}) {
  const step = useAuthFlowStore((state) => state.step);
  const activeStep = step === 'closed' ? 'explanation' : step;
  const email = useAuthFlowStore((state) => state.email);
  const ageGateConfirmed = useAuthFlowStore((state) => state.ageGateConfirmed);
  const goals = useAuthFlowStore((state) => state.goals);
  const blockers = useAuthFlowStore((state) => state.blockers);
  const freeTextGoal = useAuthFlowStore((state) => state.freeTextGoal);
  const setStep = useAuthFlowStore((state) => state.setStep);
  const setEmail = useAuthFlowStore((state) => state.setEmail);
  const setAgeGateConfirmed = useAuthFlowStore((state) => state.setAgeGateConfirmed);
  const toggleGoal = useAuthFlowStore((state) => state.toggleGoal);
  const toggleBlocker = useAuthFlowStore((state) => state.toggleBlocker);
  const setFreeTextGoal = useAuthFlowStore((state) => state.setFreeTextGoal);
  const reset = useAuthFlowStore((state) => state.reset);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState(false);

  useEffect(() => {
    if (!visible) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const session = await getSession().catch(() => null);
      const pendingAuth = await getPendingAuth();
      if (cancelled) {
        return;
      }
      const nextStep = authFlowResumeStep(session, pendingAuth);
      if (nextStep === 'onboarding') {
        await clearPendingAuth();
        if (!cancelled) {
          setStep(nextStep);
        }
        return;
      }
      if (nextStep === 'otp' || nextStep === 'sign_in_otp') {
        setEmail(pendingAuth?.email ?? '');
      }
      setStep(nextStep);
    })();
    return () => {
      cancelled = true;
    };
  }, [setEmail, setStep, visible]);

  const close = () => {
    reset();
    setError(null);
    onClose();
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (actionError) {
      setError(actionError instanceof AuthServiceError ? actionError.message : 'Account setup failed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () =>
    void run(async () => {
      if (activeStep === 'sign_in_email') {
        await beginEmailSignIn(email);
        setStep('sign_in_otp');
      } else {
        await beginEmailConversion(email);
        setStep('otp');
      }
    });

  const verifyCode = () =>
    void run(async () => {
      if (activeStep === 'sign_in_otp') {
        await verifyEmailSignIn(email, otp);
      } else {
        await verifyEmailConversion(email, otp);
      }
      setOtp('');
      setStep('onboarding');
    });

  const [otp, setOtp] = useState('');

  const finishOnboarding = () =>
    void run(async () => {
      await saveOnboarding({ ageGateConfirmed, goals, blockers, freeTextGoal });
      await claimUnclaimedAttempt(attempt);
      setStep('complete');
    });

  const handleSignOut = () =>
    void run(async () => {
      await signOut();
      onSignedOut();
      close();
    });

  const handleDelete = () =>
    void run(async () => {
      await deleteAccount();
      close();
    });

  return (
    <Modal accessibilityViewIsModal animationType="slide" onRequestClose={close} transparent visible={visible}>
      <View style={styles.backdrop}>
        <ScrollView contentContainerStyle={styles.scrollContent} style={styles.sheet}>
          <View style={styles.headerRow}>
            <Text style={styles.kicker}>QUICK READ SETUP</Text>
            <Pressable accessibilityLabel="Close account setup" accessibilityRole="button" onPress={close} style={styles.closeButton}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>

          {activeStep === 'explanation' && (
            <>
              <Text accessibilityRole="header" style={styles.title}>Keep this take with you.</Text>
              <Text style={styles.body}>Create an account to save the prompt, duration, and completed time. Your recording stays on this device and is not uploaded or analyzed.</Text>
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: ageGateConfirmed }} onPress={() => setAgeGateConfirmed(!ageGateConfirmed)} style={styles.checkboxRow}>
                <View style={[styles.checkbox, ageGateConfirmed && styles.checkboxChecked]}>{ageGateConfirmed && <Text style={styles.checkmark}>✓</Text>}</View>
                <Text style={styles.checkboxLabel}>I confirm I am 13 or older.</Text>
              </Pressable>
              <FlowButton disabled={!ageGateConfirmed} label="Continue with email" onPress={() => setStep('email')} />
              <FlowButton label="Sign in to an existing account" onPress={() => setStep('sign_in_email')} secondary />
              <FlowButton label="Not now" onPress={close} secondary />
            </>
          )}

          {(activeStep === 'email' || activeStep === 'sign_in_email') && (
            <>
              <Text accessibilityRole="header" style={styles.title}>{activeStep === 'email' ? 'Where should we send the code?' : 'Welcome back.'}</Text>
              <Text style={styles.body}>{activeStep === 'email' ? 'We use a one-time code. No password required.' : 'Enter the email on your MicDrop account.'}</Text>
              <TextInput autoCapitalize="none" autoComplete="email" autoCorrect={false} keyboardType="email-address" onChangeText={setEmail} placeholder="you@example.com" style={styles.input} value={email} />
              <FlowButton disabled={busy} label={busy ? 'Sending code…' : 'Send email code'} onPress={sendCode} />
              <FlowButton label="Back" onPress={() => setStep('explanation')} secondary />
            </>
          )}

          {(activeStep === 'otp' || activeStep === 'sign_in_otp') && (
            <>
              <Text accessibilityRole="header" style={styles.title}>Enter your code.</Text>
              <Text style={styles.body}>We sent a one-time code to {email}. Your local take stays recoverable if the code expires.</Text>
              <TextInput autoCapitalize="none" autoCorrect={false} keyboardType="number-pad" onChangeText={setOtp} placeholder="123456" style={styles.input} value={otp} />
              <FlowButton disabled={busy || otp.trim().length < 4} label={busy ? 'Checking code…' : 'Verify code'} onPress={verifyCode} />
              <FlowButton label="Back" onPress={() => setStep(activeStep === 'otp' ? 'email' : 'sign_in_email')} secondary />
            </>
          )}

          {activeStep === 'onboarding' && (
            <>
              <Text accessibilityRole="header" style={styles.title}>What do you want to unlock?</Text>
              <Text style={styles.body}>Pick at least one goal and one thing that gets in the way. This only personalizes your next local practice.</Text>
              <Text style={styles.label}>MY GOALS</Text>
              <OptionList options={SPEAKING_GOALS} selected={goals} onToggle={toggleGoal} />
              <Text style={styles.label}>WHAT STOPS ME</Text>
              <OptionList options={SPEAKING_BLOCKERS} selected={blockers} onToggle={toggleBlocker} />
              <TextInput multiline onChangeText={setFreeTextGoal} placeholder="Optional: a specific speaking situation" style={[styles.input, styles.multilineInput]} value={freeTextGoal} />
              <FlowButton disabled={busy || goals.length === 0 || blockers.length === 0} label={busy ? 'Saving locally…' : 'Finish setup'} onPress={finishOnboarding} />
            </>
          )}

          {activeStep === 'complete' && (
            <>
              <Text accessibilityRole="header" style={styles.title}>Your Quick Read is ready.</Text>
              <Text style={styles.body}>{attempt ? 'The completed attempt metadata is claimed to your account. Your recording remains on this device; nothing was uploaded or analyzed.' : 'Your account is ready. Any recording remains on this device; nothing was uploaded or analyzed.'}</Text>
              <FlowButton label="Done" onPress={close} />
              <FlowButton label="Sign out" onPress={handleSignOut} secondary />
              {!deleteConfirmation ? (
                <FlowButton label="Delete account" onPress={() => setDeleteConfirmation(true)} secondary />
              ) : (
                <View style={styles.confirmationBox}>
                  <Text style={styles.warning}>This deletes your account metadata and auth identity.</Text>
                  <FlowButton disabled={busy} label="Delete my account" onPress={handleDelete} />
                  <FlowButton label="Keep account" onPress={() => setDeleteConfirmation(false)} secondary />
                </View>
              )}
            </>
          )}

          {error && <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
        </ScrollView>
      </View>
    </Modal>
  );
}

function OptionList({ options, selected, onToggle }: { options: readonly string[]; selected: string[]; onToggle: (value: string) => void }) {
  return (
    <View style={styles.optionList}>
      {options.map((option) => {
        const isSelected = selected.includes(option);
        return (
          <Pressable accessibilityLabel={option} accessibilityRole="checkbox" accessibilityState={{ checked: isSelected }} key={option} onPress={() => onToggle(option)} style={[styles.option, isSelected && styles.optionSelected]}>
            <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>{option}</Text>
          </Pressable>
        );
      })}
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
  scrollContent: { gap: 16, padding: 24, paddingBottom: 42 },
  headerRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  kicker: { color: '#e4572e', fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  closeButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  closeText: { color: '#526c63', fontSize: 14, fontWeight: '700' },
  title: { color: '#18332d', fontFamily: 'Georgia', fontSize: 32, fontWeight: '700', lineHeight: 38 },
  body: { color: '#526c63', fontSize: 16, lineHeight: 24 },
  checkboxRow: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 48 },
  checkbox: { alignItems: 'center', borderColor: '#b9aa98', borderRadius: 6, borderWidth: 1, height: 24, justifyContent: 'center', width: 24 },
  checkboxChecked: { backgroundColor: '#18332d', borderColor: '#18332d' },
  checkmark: { color: '#86c7b3', fontSize: 17, fontWeight: '900' },
  checkboxLabel: { color: '#18332d', flex: 1, fontSize: 15 },
  input: { backgroundColor: '#f4ebdd', borderColor: '#c4b5a2', borderRadius: 12, borderWidth: 1, color: '#18332d', fontSize: 16, minHeight: 54, paddingHorizontal: 16 },
  multilineInput: { minHeight: 86, paddingTop: 14, textAlignVertical: 'top' },
  button: { alignItems: 'center', backgroundColor: '#e4572e', borderRadius: 12, justifyContent: 'center', minHeight: 54, paddingHorizontal: 16 },
  secondaryButton: { backgroundColor: 'transparent', borderColor: '#b9aa98', borderWidth: 1 },
  buttonText: { color: '#fffaf2', fontSize: 15, fontWeight: '900' },
  secondaryButtonText: { color: '#18332d' },
  disabled: { opacity: 0.45 },
  label: { color: '#799087', fontSize: 11, fontWeight: '900', letterSpacing: 2, marginTop: 6 },
  optionList: { gap: 8 },
  option: { backgroundColor: '#f4ebdd', borderColor: '#c4b5a2', borderRadius: 10, borderWidth: 1, minHeight: 46, justifyContent: 'center', paddingHorizontal: 14 },
  optionSelected: { backgroundColor: '#18332d', borderColor: '#18332d' },
  optionText: { color: '#18332d', fontSize: 14 },
  optionTextSelected: { color: '#f4ebdd', fontWeight: '700' },
  error: { backgroundColor: '#f8d8ca', borderRadius: 10, color: '#8c321e', fontSize: 14, lineHeight: 20, padding: 12 },
  confirmationBox: { gap: 12 },
  warning: { color: '#8c321e', fontSize: 14, lineHeight: 20 },
});
