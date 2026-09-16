import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { AuthServiceError, deleteAccount, getSession, signOut } from '@/features/auth/auth-service';
import { ActionButton } from '@/ui/ActionButton';
import { colors, radii, shadows, spacing, typography } from '@/ui/theme';

type AccountState = 'checking' | 'anonymous' | 'signed-in' | 'unavailable';

export function SettingsSheet({
  onClose,
  onOpenSignIn,
  onSignedOut,
  visible,
}: {
  onClose: () => void;
  onOpenSignIn: () => void;
  onSignedOut: () => void;
  visible: boolean;
}) {
  const { width } = useWindowDimensions();
  const [accountState, setAccountState] = useState<AccountState>('checking');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmationVisible, setDeleteConfirmationVisible] = useState(false);

  useEffect(() => {
    if (!visible) {
      return;
    }
    let cancelled = false;
    void (async () => {
      setAccountState('checking');
      setError(null);
      setDeleteConfirmationVisible(false);
      try {
        const session = await getSession();
        if (!cancelled) {
          setAccountState(session?.user && session.user.is_anonymous === false ? 'signed-in' : 'anonymous');
        }
      } catch {
        if (!cancelled) {
          setAccountState('unavailable');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (settingsError) {
      setError(settingsError instanceof AuthServiceError ? settingsError.message : 'Settings action failed. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = () =>
    void run(async () => {
      await signOut();
      onSignedOut();
      onClose();
    });

  const handleDelete = () =>
    void run(async () => {
      await deleteAccount();
      onSignedOut();
      onClose();
    });

  const openSignIn = () => {
    onClose();
    onOpenSignIn();
  };

  return (
    <Modal accessibilityViewIsModal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View
        onStartShouldSetResponder={() => true}
        style={styles.backdrop}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          onStartShouldSetResponder={() => true}
          style={[styles.sheet, { maxWidth: Math.min(width - spacing.xxl, 520) }]}>
          <View style={styles.header}>
            <Text style={styles.kicker}>SETTINGS</Text>
            <Pressable accessibilityLabel="Close Settings" accessibilityRole="button" onPress={onClose} style={styles.close}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>

          <Text accessibilityRole="header" style={styles.title}>Settings</Text>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Account</Text>
            <Text accessibilityLiveRegion="polite" style={styles.body}>{accountCopy(accountState)}</Text>
            {accountState === 'anonymous' && <ActionButton label="Returning user? Sign in" onPress={openSignIn} secondary />}
            {accountState === 'signed-in' && (
              <>
                <ActionButton disabled={busy} label={busy ? 'Signing out…' : 'Sign out'} onPress={handleSignOut} secondary />
                {!deleteConfirmationVisible ? (
                  <ActionButton label="Delete account" onPress={() => setDeleteConfirmationVisible(true)} secondary />
                ) : (
                  <View style={styles.dangerBox}>
                    <Text style={styles.dangerText}>Delete account metadata and sign out of this device?</Text>
                    <ActionButton disabled={busy} label={busy ? 'Deleting…' : 'Delete account'} onPress={handleDelete} />
                    <ActionButton label="Keep account" onPress={() => setDeleteConfirmationVisible(false)} secondary />
                  </View>
                )}
              </>
            )}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Personalization</Text>
            <Text style={styles.body}>Goals, blockers, fonts, and final brand assets are deferred. Recording and Quick Read stay available without extra setup.</Text>
          </View>

          {error && <Text accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
        </ScrollView>
      </View>
    </Modal>
  );
}

function accountCopy(accountState: AccountState) {
  switch (accountState) {
    case 'checking':
      return 'Checking account status…';
    case 'signed-in':
      return 'You’re signed in. New Drops can attach to this account.';
    case 'anonymous':
      return 'You can record anonymously. Sign in here before recording if you already have a DropMic account.';
    case 'unavailable':
      return 'Account setup is not configured here. Recordings remain on this device.';
  }
}

const styles = StyleSheet.create({
  backdrop: { alignItems: 'center', backgroundColor: 'rgba(8, 31, 51, 0.48)', flex: 1, justifyContent: 'center', padding: spacing.lg },
  sheet: { alignSelf: 'center', backgroundColor: colors.surface, borderRadius: radii.lg, width: '100%', ...shadows.card },
  content: { gap: spacing.lg, padding: spacing.xxl },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  kicker: { color: colors.coral, ...typography.eyebrow },
  close: { justifyContent: 'center', minHeight: 44, paddingHorizontal: spacing.xs },
  closeText: { color: colors.muted, ...typography.label },
  title: { color: colors.inkStrong, fontFamily: typography.displayFamily, ...typography.displayMedium },
  card: { backgroundColor: colors.surfaceMuted, borderRadius: radii.md, gap: spacing.md, padding: spacing.lg },
  cardTitle: { color: colors.inkStrong, ...typography.title },
  body: { color: colors.muted, ...typography.body },
  dangerBox: { gap: spacing.md },
  dangerText: { color: colors.danger, fontSize: 14, lineHeight: 21 },
  error: { backgroundColor: colors.dangerSoft, borderRadius: radii.md, color: colors.danger, fontSize: 14, lineHeight: 21, padding: spacing.md },
});
