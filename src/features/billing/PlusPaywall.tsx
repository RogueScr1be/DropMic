import { useEffect, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getSession } from '@/features/auth/auth-service';
import { trackEvent } from '@/features/analytics/analytics';

import { revenueCatAdapter } from './revenuecat-adapter';

type PackageOption = { identifier: string | null; title: string; price: string; description: string };

const FALLBACK_PRODUCTS: PackageOption[] = [
  { identifier: null, title: 'Monthly', price: 'Unavailable', description: 'Configure the RevenueCat monthly package.' },
  { identifier: null, title: 'Annual', price: 'Unavailable', description: 'Configure the RevenueCat annual package.' },
  { identifier: null, title: 'Lifetime', price: 'Unavailable', description: 'Configure the RevenueCat lifetime package.' },
];

function readPackages(value: unknown): PackageOption[] {
  const packages = (value as { current?: { availablePackages?: { identifier?: unknown; product?: { title?: unknown; priceString?: unknown; description?: unknown } }[] } } | null)?.current?.availablePackages;
  if (!Array.isArray(packages)) return [];
  return packages.flatMap((item) => {
    const identifier = typeof item.identifier === 'string' ? item.identifier : '';
    if (!identifier) return [];
    return [{ identifier, title: typeof item.product?.title === 'string' ? item.product.title : identifier, price: typeof item.product?.priceString === 'string' ? item.product.priceString : 'See App Store', description: typeof item.product?.description === 'string' ? item.product.description : 'Plus access' }];
  });
}

export function PlusPaywall({ onClose, visible }: { onClose: () => void; visible: boolean }) {
  const [products, setProducts] = useState<PackageOption[]>(FALLBACK_PRODUCTS);
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    void trackEvent('paywall_viewed');
    void getSession().then((session) => revenueCatAdapter.getTestStoreOfferings(session)).then((offerings) => {
      const configured = readPackages(offerings);
      if (configured.length > 0) {
        setProducts(configured);
        setSelected(configured[0].identifier);
      }
    }).catch(() => undefined);
  }, [visible]);

  const purchase = async () => {
    setBusy(true); setMessage(null);
    try {
      if (!selected) {
        setMessage('Plus products are not configured yet.');
        return;
      }
      void trackEvent('product_selected', { dedupeKey: `product:${selected}` });
      const session = await getSession();
      if (!session?.user || session.user.is_anonymous) {
        setMessage('Create a free account first so your purchase stays attached to you.');
        return;
      }
      const result = await revenueCatAdapter.purchasePackage?.(session, selected) ?? { ok: false as const, reason: 'billing_unavailable' };
      if (result.ok) {
        setMessage('Purchase complete. Plus access will appear after the verified entitlement sync.');
        void trackEvent('purchase_completed');
      } else if (result.reason === 'purchase_cancelled') {
        setMessage('Purchase cancelled. Your account was not changed.');
        void trackEvent('purchase_cancelled');
      } else {
        setMessage('This product is not available yet. Check RevenueCat configuration.');
        void trackEvent('purchase_failed', { dedupeKey: `purchase-failed:${selected}` });
      }
    } catch {
      setMessage('Purchase could not finish. Your account was not changed.');
      void trackEvent('purchase_failed', { dedupeKey: `purchase-failed:${selected}` });
    } finally { setBusy(false); }
  };

  const restore = async () => {
    setBusy(true); setMessage(null);
    try {
      const result = await revenueCatAdapter.restorePurchases?.(await getSession()) ?? { ok: false as const, reason: 'billing_unavailable' };
      setMessage(result.ok ? 'Restore requested. Verified access will refresh shortly.' : 'Restore is unavailable right now.');
      if (result.ok) void trackEvent('restore_completed');
    } finally { setBusy(false); }
  };

  return <Modal accessibilityViewIsModal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
    <View style={styles.backdrop}><ScrollView contentContainerStyle={styles.content} style={styles.sheet}>
      <View style={styles.header}><Text style={styles.kicker}>DROPMIC PLUS</Text><Pressable accessibilityLabel="Close Plus" onPress={onClose}><Text style={styles.close}>Close</Text></Pressable></View>
      <Text accessibilityRole="header" style={styles.title}>More room to find your voice.</Text>
      <Text style={styles.body}>Unlock 60- and 90-second Drops, unlimited Saved Drops, and the full Quick Read. Quick Reads remain capped at three per day.</Text>
      {products.map((product) => <Pressable key={product.identifier ?? product.title} accessibilityRole="radio" accessibilityState={{ selected: selected === product.identifier && product.identifier !== null }} onPress={() => product.identifier && setSelected(product.identifier)} style={[styles.product, selected === product.identifier && product.identifier !== null && styles.selected]}>
        <View><Text style={styles.productTitle}>{product.title}</Text><Text style={styles.productDescription}>{product.description}</Text></View><Text style={styles.price}>{product.price}</Text>
      </Pressable>)}
      {message && <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text>}
      <Pressable accessibilityRole="button" accessibilityLabel="Purchase Plus" disabled={busy} onPress={() => void purchase()} style={styles.primary}><Text style={styles.primaryText}>{busy ? 'Working…' : 'Get Plus'}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Restore purchases" disabled={busy} onPress={() => void restore()} style={styles.secondary}><Text style={styles.secondaryText}>Restore purchases</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Manage subscription" onPress={() => void revenueCatAdapter.presentCustomerCenter?.()} style={styles.secondary}><Text style={styles.secondaryText}>Manage subscription</Text></Pressable>
      <View style={styles.legal}><Text style={styles.legalText}>Subscriptions renew automatically unless cancelled. Terms and Privacy apply.</Text><Pressable onPress={() => { const url = process.env.EXPO_PUBLIC_DROPMIC_TERMS_URL?.trim(); if (url) void Linking.openURL(url); else setMessage('Terms link is not configured yet.'); }}><Text style={styles.link}>Terms</Text></Pressable><Pressable onPress={() => { const url = process.env.EXPO_PUBLIC_DROPMIC_PRIVACY_URL?.trim(); if (url) void Linking.openURL(url); else setMessage('Privacy link is not configured yet.'); }}><Text style={styles.link}>Privacy</Text></Pressable></View>
    </ScrollView></View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(24, 51, 45, 0.58)', flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fffaf2', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%' },
  content: { gap: 16, padding: 24, paddingBottom: 42 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  kicker: { color: '#e4572e', fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  close: { color: '#526c63', fontWeight: '700', padding: 8 },
  title: { color: '#18332d', fontFamily: 'Georgia', fontSize: 32, fontWeight: '700', lineHeight: 38 },
  body: { color: '#526c63', fontSize: 16, lineHeight: 24 },
  product: { alignItems: 'center', backgroundColor: '#f4ebdd', borderColor: '#c4b5a2', borderRadius: 14, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', padding: 16 },
  selected: { backgroundColor: '#e7dccb', borderColor: '#18332d', borderWidth: 2 },
  productTitle: { color: '#18332d', fontSize: 16, fontWeight: '900' },
  productDescription: { color: '#526c63', fontSize: 13, marginTop: 4 },
  price: { color: '#18332d', fontFamily: 'Georgia', fontSize: 20, fontWeight: '700' },
  message: { color: '#e4572e', fontSize: 14, lineHeight: 20 },
  primary: { alignItems: 'center', backgroundColor: '#18332d', borderRadius: 14, minHeight: 58, justifyContent: 'center' },
  primaryText: { color: '#fffaf2', fontSize: 16, fontWeight: '900' },
  secondary: { alignItems: 'center', borderColor: '#c4b5a2', borderRadius: 14, borderWidth: 1, minHeight: 52, justifyContent: 'center' },
  secondaryText: { color: '#18332d', fontSize: 15, fontWeight: '800' },
  legal: { alignItems: 'center', gap: 8, paddingTop: 4 },
  legalText: { color: '#799087', fontSize: 12, lineHeight: 18, textAlign: 'center' },
  link: { color: '#e4572e', fontSize: 13, fontWeight: '800' },
});
