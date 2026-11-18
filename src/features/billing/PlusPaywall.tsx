import { useEffect, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getSession } from '@/features/auth/auth-service';
import { trackEvent } from '@/features/analytics/analytics';
import { getPlusDisplayEligibility, syncRevenueCatEntitlement } from './plus-display';

import { revenueCatAdapter } from './revenuecat-adapter';
import { colors, radii, spacing, typography } from '@/ui/theme';

type PackageOption = { identifier: string | null; productId: string | null; title: string; price: string; description: string };

const FALLBACK_PRODUCTS: PackageOption[] = [
  { identifier: null, productId: null, title: 'Monthly', price: 'Unavailable', description: 'Configure the RevenueCat monthly subscription.' },
  { identifier: null, productId: null, title: 'Annual', price: 'Unavailable', description: 'Configure the RevenueCat annual subscription.' },
];

function readPackages(value: unknown): PackageOption[] {
  const packages = (value as { current?: { availablePackages?: { identifier?: unknown; product?: { identifier?: unknown; title?: unknown; priceString?: unknown; description?: unknown } }[] } } | null)?.current?.availablePackages;
  if (!Array.isArray(packages)) return [];
  return packages.flatMap((item) => {
    const identifier = typeof item.identifier === 'string' ? item.identifier : '';
    const productId = typeof item.product?.identifier === 'string' ? item.product.identifier : '';
    if (!identifier || !['dropmic_plus_monthly', 'dropmic_plus_annual'].includes(productId)) return [];
    const title = productId.endsWith('_monthly') ? 'Monthly' : 'Annual';
    return [{ identifier, productId, title, price: typeof item.product?.priceString === 'string' ? item.product.priceString : 'See App Store', description: typeof item.product?.description === 'string' ? item.product.description : 'DropMic Plus subscription' }];
  });
}

export function PlusPaywall({ onAccessUpdated, onClose, visible }: { onAccessUpdated?: (enabled: boolean) => void; onClose: () => void; visible: boolean }) {
  const [products, setProducts] = useState<PackageOption[]>(FALLBACK_PRODUCTS);
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    void trackEvent('paywall_viewed');
    void getSession().then((session) => revenueCatAdapter.getOfferings(session)).then((offerings) => {
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
        const syncAccepted = await syncRevenueCatEntitlement();
        const verified = syncAccepted ? await getPlusDisplayEligibility() : false;
        onAccessUpdated?.(verified);
        setMessage(verified
          ? 'Purchase complete. Plus is active on your account.'
          : 'Purchase complete. Store verification is still processing; Plus will appear after confirmation.');
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
      if (result.ok) {
        const syncAccepted = await syncRevenueCatEntitlement();
        const verified = syncAccepted ? await getPlusDisplayEligibility() : false;
        onAccessUpdated?.(verified);
        setMessage(verified
          ? 'Purchases restored. Plus is active on your account.'
          : 'Restore complete. Store verification is still processing; Plus will appear after confirmation.');
        void trackEvent('restore_completed');
      } else {
        setMessage('Restore is unavailable right now.');
      }
    } catch {
      setMessage('Restore is unavailable right now.');
    } finally { setBusy(false); }
  };

  return <Modal accessibilityViewIsModal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
    <View style={styles.backdrop}><ScrollView contentContainerStyle={styles.content} style={styles.sheet}>
      <View style={styles.header}><Text style={styles.kicker}>DROPMIC PLUS</Text><Pressable accessibilityLabel="Close Plus" onPress={onClose}><Text style={styles.close}>Close</Text></Pressable></View>
      <Text accessibilityRole="header" style={styles.title}>Find Your Voice.</Text>
      <Text style={styles.body}>Practice for 60 or 90 seconds, compare two takes, and see the exact moments behind your feedback—with the same core score and coaching you get on Free.</Text>
      {products.map((product) => <Pressable key={product.identifier ?? product.title} accessibilityRole="radio" accessibilityState={{ selected: selected === product.identifier && product.identifier !== null }} onPress={() => product.identifier && setSelected(product.identifier)} style={[styles.product, selected === product.identifier && product.identifier !== null && styles.selected]}>
        <View style={styles.productCopy}><Text style={styles.productTitle}>{product.title}</Text><Text style={styles.productDescription}>{product.description}</Text></View><Text style={styles.price}>{product.price}</Text>
      </Pressable>)}
      {message && <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text>}
      <Pressable accessibilityRole="button" accessibilityLabel="Purchase Plus" disabled={busy} onPress={() => void purchase()} style={styles.primary}><Text style={styles.primaryText}>{busy ? 'Working…' : 'Get Plus'}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Restore purchases" disabled={busy} onPress={() => void restore()} style={styles.secondary}><Text style={styles.secondaryText}>Restore purchases</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Manage subscription" onPress={() => void revenueCatAdapter.presentCustomerCenter?.()} style={styles.secondary}><Text style={styles.secondaryText}>Manage subscription</Text></Pressable>
      <Text style={styles.legalText}>Subscriptions renew automatically unless cancelled.</Text>
      <View style={styles.legalLinks}><Pressable accessibilityRole="link" onPress={() => { const url = process.env.EXPO_PUBLIC_DROPMIC_TERMS_URL?.trim(); if (url) void Linking.openURL(url); else setMessage('Terms link is not configured yet.'); }}><Text style={styles.link}>Terms</Text></Pressable><Pressable accessibilityRole="link" onPress={() => { const url = process.env.EXPO_PUBLIC_DROPMIC_PRIVACY_URL?.trim(); if (url) void Linking.openURL(url); else setMessage('Privacy link is not configured yet.'); }}><Text style={styles.link}>Privacy</Text></Pressable></View>
    </ScrollView></View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: colors.overlay, flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radii.lg, borderTopRightRadius: radii.lg, maxHeight: '92%' },
  content: { gap: spacing.lg, padding: spacing.xxl, paddingBottom: spacing.jumbo + spacing.xs },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  kicker: { color: colors.coral, ...typography.eyebrow },
  close: { color: colors.muted, fontWeight: '700', padding: spacing.sm },
  title: { color: colors.ink, fontFamily: typography.displayFamily, ...typography.displayMedium },
  body: { color: colors.muted, ...typography.body },
  product: { alignItems: 'center', backgroundColor: colors.surfaceMuted, borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.md, justifyContent: 'space-between', padding: spacing.lg },
  selected: { backgroundColor: colors.surfaceMuted, borderColor: colors.ink, borderWidth: 2 },
  productTitle: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  productCopy: { flex: 1, minWidth: 0 },
  productDescription: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: spacing.xs },
  price: { color: colors.ink, flexShrink: 0, fontFamily: typography.displayFamily, fontSize: 19, fontWeight: '700', textAlign: 'right' },
  message: { color: colors.coral, fontSize: 14, lineHeight: 20 },
  primary: { alignItems: 'center', backgroundColor: colors.ink, borderRadius: radii.md, minHeight: 58, justifyContent: 'center' },
  primaryText: { color: colors.surface, fontSize: 16, fontWeight: '900' },
  secondary: { alignItems: 'center', borderColor: colors.border, borderRadius: radii.md, borderWidth: 1, minHeight: 52, justifyContent: 'center' },
  secondaryText: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  legalLinks: { alignItems: 'center', flexDirection: 'row', gap: spacing.xxl, justifyContent: 'center', paddingTop: spacing.xs / 2 },
  legalText: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  link: { color: colors.coral, fontSize: 13, fontWeight: '800' },
});
