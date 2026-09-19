import { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useAuthFlowStore } from './auth-flow-store';
import { authFlowResumeStep, getPendingAuth } from './auth-recovery';
import {
  AuthServiceError,
  beginEmailConversion,
  beginEmailSignIn,
  claimUnclaimedAttempt,
  deleteAccount,
  getSession,
  isDevTestLoginEnabled,
  signInWithDevTestAccount,
  signOut,
  verifyEmailConversion,
  verifyEmailSignIn,
} from './auth-service';
import type { UnclaimedAttempt } from './auth-recovery';

export function SignupFlow({
  attempt,
  mode = 'conversion',
  onAttemptClaimed,
  onClose,
  onDeveloperLogin,
  onSignedOut,
  visible,
}: {
  attempt: UnclaimedAttempt | null;
  mode?: 'conversion' | 'sign-in';
  onAttemptClaimed?: (attemptId: string) => void;
  onClose: () => void;
  onDeveloperLogin?: () => void;
  onSignedOut: () => void;
  visible: boolean;
}) {
  const step = useAuthFlowStore((state) => state.step);
  const activeStep = step === 'closed' ? 'explanation' : step;
  const email = useAuthFlowStore((state) => state.email);
  const setStep = useAuthFlowStore((state) => state.setStep);
  const setEmail = useAuthFlowStore((state) => state.setEmail);
  const reset = useAuthFlowStore((state) => state.reset);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [devLoginOpen, setDevLoginOpen] = useState(false);
  const [devEmail, setDevEmail] = useState('');
  const [devPassword, setDevPassword] = useState('');
  const devLoginInFlight = useRef(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState(false);
  const isPostRecordingConversion = Boolean(attempt);
  const claimedAttemptRef = useRef<string | null>(null);

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
      if (nextStep === 'otp' || nextStep === 'sign_in_otp') {
        setEmail(pendingAuth?.email ?? '');
      }
      setStep(nextStep === 'explanation' && mode === 'sign-in' ? 'sign_in_email' : nextStep);
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, setEmail, setStep, visible]);

  const close = () => {
    reset();
    setError(null);
    setDevLoginOpen(false);
    setDevEmail('');
    setDevPassword('');
    onClose();
  };

  useEffect(() => () => {
    setDevEmail('');
    setDevPassword('');
  }, []);

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
      await finishSetup();
    });

  const submitDevLogin = async () => {
    if (busy || devLoginInFlight.current) {
      return;
    }
    devLoginInFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      await signInWithDevTestAccount(devEmail, devPassword);
      setDevEmail('');
      setDevPassword('');
      onDeveloperLogin?.();
      close();
    } catch (loginError) {
      setError(loginError instanceof AuthServiceError ? loginError.message : 'Development test login failed.');
    } finally {
      setDevPassword('');
      setBusy(false);
      devLoginInFlight.current = false;
    }
  };

  const [otp, setOtp] = useState('');

  const finishSetup = async () => {
    if (!attempt) {
      setStep('complete');
      return;
    }
    if (attempt && claimedAttemptRef.current === attempt.clientAttemptId) {
      setStep('complete');
      return;
    }
    const claimedAttemptId = await claimUnclaimedAttempt(attempt);
    if (typeof claimedAttemptId === 'string') {
      claimedAttemptRef.current = attempt?.clientAttemptId ?? claimedAttemptId;
      onAttemptClaimed?.(claimedAttemptId);
    }
    setStep('complete');
  };

  useEffect(() => {
    if (!visible || activeStep !== 'complete' || !attempt || claimedAttemptRef.current === attempt.clientAttemptId) {
      return;
    }
    void run(finishSetup);
    // finishSetup intentionally captures the current visible attempt and callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStep, attempt, visible]);

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
            <Text style={styles.kicker}>DROPMIC</Text>
            <Pressable accessibilityLabel="Close account setup" accessibilityRole="button" onPress={close} style={styles.closeButton}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>

          {activeStep === 'explanation' && (
            <>
              <Text accessibilityRole="header" style={styles.title}>{isPostRecordingConversion ? 'Join DropMic' : 'Returning to DropMic?'}</Text>
              <Text style={styles.body}>
                {isPostRecordingConversion
                  ? 'Improve your speaking and social skills, 60 seconds at a time. Ready for your first Read?'
                  : 'Sign in before recording so new Drops attach to your existing account.'}
              </Text>
              <FlowButton label={isPostRecordingConversion ? 'Sign Up' : 'Create a new account'} onPress={() => setStep('email')} />
              <FlowButton label="Sign In" onPress={() => setStep('sign_in_email')} secondary />
            </>
          )}

          {(activeStep === 'email' || activeStep === 'sign_in_email') && (
            <>
              <Text accessibilityRole="header" style={styles.title}>{activeStep === 'email' ? 'Where should we send the code?' : 'Welcome back.'}</Text>
              <Text style={styles.body}>{activeStep === 'email' ? 'We use a one-time code. No password required.' : 'Enter the email on your DropMic account.'}</Text>
              <TextInput autoCapitalize="none" autoComplete="email" autoCorrect={false} keyboardType="email-address" onChangeText={setEmail} placeholder="you@example.com" style={styles.input} value={email} />
              <FlowButton disabled={busy} label={busy ? 'Sending code…' : 'Send email code'} onPress={sendCode} />
              <FlowButton label="Back" onPress={() => setStep('explanation')} secondary />
            </>
          )}

          {(activeStep === 'otp' || activeStep === 'sign_in_otp') && (
            <>
              {!devLoginOpen ? (
                <>
                  <Text accessibilityRole="header" style={styles.title}>Enter your code.</Text>
                  <Text style={styles.body}>We sent a one-time code to {email}. Your local take stays recoverable if the code expires.</Text>
                  <TextInput autoCapitalize="none" autoCorrect={false} keyboardType="number-pad" onChangeText={setOtp} placeholder="123456" style={styles.input} value={otp} />
                  <FlowButton disabled={busy || otp.trim().length < 4} label={busy ? 'Checking code…' : 'Verify code'} onPress={verifyCode} />
                  {isDevTestLoginEnabled() && <FlowButton label="Use Dev Test Account" onPress={() => setDevLoginOpen(true)} secondary />}
                  <FlowButton label="Back" onPress={() => setStep(activeStep === 'otp' ? 'email' : 'sign_in_email')} secondary />
                </>
              ) : (
                <>
                  <Text accessibilityRole="header" style={styles.title}>Development test account.</Text>
                  <Text style={styles.body}>Development only — unavailable in Release builds.</Text>
                  <TextInput accessibilityLabel="Development test account email" autoCapitalize="none" autoComplete="email" autoCorrect={false} keyboardType="email-address" onChangeText={setDevEmail} placeholder="Email" style={styles.input} value={devEmail} />
                  <TextInput accessibilityLabel="Development test account password" autoCapitalize="none" autoCorrect={false} onChangeText={setDevPassword} placeholder="Password" secureTextEntry style={styles.input} value={devPassword} />
                  <FlowButton disabled={busy || devEmail.trim().length === 0 || devPassword.length === 0} label={busy ? 'Signing in…' : 'Sign In for Testing'} onPress={() => void submitDevLogin()} />
                  <FlowButton label="Back to Code" onPress={() => { setDevLoginOpen(false); setDevEmail(''); setDevPassword(''); setError(null); }} secondary />
                </>
              )}
            </>
          )}

          {activeStep === 'complete' && (
            <>
              <Text accessibilityRole="header" style={styles.title}>Your Quick Read is ready.</Text>
              <Text style={styles.body}>{attempt ? 'This take is attached to your account. Your recording remains on this device until you approve the Quick Read upload.' : 'Your account is ready. New recordings can attach to this sign-in.'}</Text>
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
  input: { backgroundColor: '#f4ebdd', borderColor: '#c4b5a2', borderRadius: 12, borderWidth: 1, color: '#18332d', fontSize: 16, minHeight: 54, paddingHorizontal: 16 },
  button: { alignItems: 'center', backgroundColor: '#e4572e', borderRadius: 12, justifyContent: 'center', minHeight: 54, paddingHorizontal: 16 },
  secondaryButton: { backgroundColor: 'transparent', borderColor: '#b9aa98', borderWidth: 1 },
  buttonText: { color: '#fffaf2', fontSize: 15, fontWeight: '900' },
  secondaryButtonText: { color: '#18332d' },
  disabled: { opacity: 0.45 },
  error: { backgroundColor: '#f8d8ca', borderRadius: 10, color: '#8c321e', fontSize: 14, lineHeight: 20, padding: 12 },
  confirmationBox: { gap: 12 },
  warning: { color: '#8c321e', fontSize: 14, lineHeight: 20 },
});
