import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';

import { AUTH_CALLBACK_SUCCESS_HREF, parseAuthCallbackUrl } from '@/features/auth/auth-callback';
import { completeAuthCallback } from '@/features/auth/auth-service';

function currentCallbackUrl() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.location.href;
  }
  return Linking.getInitialURL();
}

export default function AuthCallbackRoute() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const result = parseAuthCallbackUrl(await currentCallbackUrl());
        if (result.kind === 'error') {
          throw new Error(result.message);
        }

        await completeAuthCallback(result.kind === 'session' ? result : null);
        if (!cancelled) {
          router.replace(AUTH_CALLBACK_SUCCESS_HREF);
        }
      } catch {
        if (!cancelled) {
          setError('This verification link is invalid or expired. Request a new one.');
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (error) {
    return (
      <View style={styles.container}>
        <Text accessibilityRole="header" style={styles.title}>Verification needs a fresh link.</Text>
        <Text style={styles.body}>{error}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Return to MicDrop" onPress={() => router.replace('/')} style={styles.button}>
          <Text style={styles.buttonText}>Return to MicDrop</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text accessibilityRole="header" style={styles.title}>Finishing your account setup…</Text>
      <Text style={styles.body}>Your session is being restored securely.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { backgroundColor: '#fffaf2', flex: 1, gap: 16, justifyContent: 'center', padding: 24 },
  title: { color: '#18332d', fontFamily: 'Georgia', fontSize: 32, fontWeight: '700', lineHeight: 38 },
  body: { color: '#526c63', fontSize: 16, lineHeight: 24 },
  button: { alignItems: 'center', backgroundColor: '#e4572e', borderRadius: 12, justifyContent: 'center', minHeight: 54, paddingHorizontal: 16 },
  buttonText: { color: '#fffaf2', fontSize: 15, fontWeight: '900' },
});
