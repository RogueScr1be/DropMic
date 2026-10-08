import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getSession } from '@/features/auth/auth-service';
import { getOwnedSkillPackIds, fetchSkillPackContent } from './skill-pack-service';
import { getPlusDisplayEligibility, syncRevenueCatEntitlement } from './plus-display';
import { revenueCatAdapter } from './revenuecat-adapter';
import { SKILL_PACKS, type SkillPackId, type SkillPackPracticeContent } from '@/features/topics/skill-packs';
import type { SpeakingTopic } from '@/features/topics/topic-catalog';

type PurchaseOption = { identifier: string; price: string };

function readPackPackages(value: unknown): Map<SkillPackId, PurchaseOption> {
  const packages = (value as { current?: { availablePackages?: { identifier?: unknown; product?: { identifier?: unknown; priceString?: unknown } }[] } } | null)?.current?.availablePackages;
  const result = new Map<SkillPackId, PurchaseOption>();
  if (!Array.isArray(packages)) return result;
  for (const pack of SKILL_PACKS) {
    const item = packages.find((candidate) => candidate.identifier === pack.packageId && candidate.product?.identifier === pack.productId);
    if (item && typeof item.identifier === 'string') {
      result.set(pack.id, {
        identifier: item.identifier,
        price: typeof item.product?.priceString === 'string' ? item.product.priceString : pack.priceFallback,
      });
    }
  }
  return result;
}

export function SkillPacksStore({
  ownedPackIds,
  onClose,
  onOwnedPacksUpdated,
  onPlusAccessUpdated,
  onPractice,
  visible,
}: {
  ownedPackIds: readonly SkillPackId[];
  onClose: () => void;
  onOwnedPacksUpdated: (ids: SkillPackId[]) => void;
  onPlusAccessUpdated: (enabled: boolean) => void;
  onPractice: (content: SkillPackPracticeContent, topic: SpeakingTopic) => void;
  visible: boolean;
}) {
  const [options, setOptions] = useState<Map<SkillPackId, PurchaseOption>>(() => new Map());
  const [content, setContent] = useState<Partial<Record<SkillPackId, SkillPackPracticeContent>>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void (async () => {
      const session = await getSession();
      const [offerings, currentOwned] = await Promise.all([
        revenueCatAdapter.getOfferings(session, 'skill_packs'),
        getOwnedSkillPackIds(),
      ]);
      if (!cancelled) setOptions(readPackPackages(offerings));
      if (!cancelled) onOwnedPacksUpdated(currentOwned);
    })().catch(() => {
      if (!cancelled) setOptions(new Map());
    });
    return () => { cancelled = true; };
  }, [onOwnedPacksUpdated, visible]);

  useEffect(() => {
    if (!visible || ownedPackIds.length === 0) return;
    let cancelled = false;
    void Promise.all(ownedPackIds.map(async (packId) => {
      try { return [packId, await fetchSkillPackContent(packId)] as const; }
      catch { return null; }
    })).then((entries) => {
      if (!cancelled) {
        setContent(Object.fromEntries(entries.filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))));
      }
    });
    return () => { cancelled = true; };
  }, [ownedPackIds, visible]);

  const restore = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const session = await getSession();
      const result = await revenueCatAdapter.restorePurchases?.(session) ?? { ok: false as const, reason: 'billing_unavailable' };
      if (!result.ok) {
        setMessage('Restore is unavailable right now.');
        return;
      }
      const synced = await syncRevenueCatEntitlement();
      onPlusAccessUpdated(synced ? await getPlusDisplayEligibility() : false);
      const restored = await getOwnedSkillPackIds();
      onOwnedPacksUpdated(restored);
      setMessage(synced ? 'Purchases checked. Your owned Packs are ready.' : 'Restore finished. Store verification is still processing.');
    } catch {
      setMessage('Restore is unavailable right now.');
    } finally {
      setBusy(false);
    }
  };

  const buy = async (packId: SkillPackId) => {
    const pack = SKILL_PACKS.find((item) => item.id === packId);
    const option = options.get(packId);
    if (!pack || !option || busy) {
      setMessage('This Pack is not available for purchase yet.');
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const session = await getSession();
      if (!session?.user || session.user.is_anonymous) {
        setMessage('Create or sign in to a free account first so this Pack stays attached to you.');
        return;
      }
      const result = await revenueCatAdapter.purchasePackage?.(session, option.identifier, 'skill_packs') ?? { ok: false as const, reason: 'billing_unavailable' };
      if (!result.ok) {
        setMessage(result.reason === 'purchase_cancelled' ? 'Purchase cancelled. Your account was not changed.' : 'This Pack could not be purchased right now.');
        return;
      }
      const synced = await syncRevenueCatEntitlement();
      onPlusAccessUpdated(synced ? await getPlusDisplayEligibility() : false);
      const nextOwned = await getOwnedSkillPackIds();
      onOwnedPacksUpdated(nextOwned);
      if (nextOwned.includes(packId)) {
        setMessage(`${pack.title} is now yours permanently.`);
      } else {
        setMessage(synced ? 'Purchase received. Pack access is still syncing.' : 'Purchase received. Store verification is still processing.');
      }
    } catch {
      setMessage('Purchase could not finish. Your account was not changed.');
    } finally {
      setBusy(false);
    }
  };

  const ownedSet = useMemo(() => new Set(ownedPackIds), [ownedPackIds]);

  return <Modal accessibilityViewIsModal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
    <View style={styles.backdrop}>
      <ScrollView contentContainerStyle={styles.content} style={styles.sheet}>
        <View style={styles.header}>
          <View><Text style={styles.kicker}>MODULAR SPEAKING PACKS</Text><Text accessibilityRole="header" style={styles.title}>Practice for what’s next.</Text></View>
          <Pressable accessibilityLabel="Close Skill Packs" accessibilityRole="button" onPress={onClose}><Text style={styles.close}>Close</Text></Pressable>
        </View>
        <Text style={styles.intro}>Each Pack is a separate one-time purchase. It never includes or replaces DropMic Plus.</Text>
        {SKILL_PACKS.map((pack) => {
          const isOwned = ownedSet.has(pack.id);
          const purchaseOption = options.get(pack.id);
          const packContent = content[pack.id];
          return <View accessibilityLabel={`${pack.title} Skill Pack`} key={pack.id} style={styles.packCard}>
            <View style={styles.packHeader}>
              <View style={styles.packTitleGroup}>
                <Text style={styles.packTitle}>{pack.title}</Text>
                <Text style={styles.packTagline}>{pack.tagline}</Text>
              </View>
              <Text style={styles.price}>{isOwned ? 'Owned' : purchaseOption?.price ?? pack.priceFallback}</Text>
            </View>
            <Text style={styles.packDescription}>{pack.description}</Text>
            <View style={styles.categoryWrap}>{pack.categories.map((category) => <Text key={category} style={styles.category}>{category}</Text>)}</View>
            <Text style={styles.oneTime}>{isOwned ? 'Permanent purchase' : 'One-time purchase · yours to keep'}</Text>
            {isOwned && packContent ? <View style={styles.ownerContent}>
              <Text style={styles.sectionLabel}>PACK WORKOUT</Text>
              <Text style={styles.guidance}>{packContent.quickReadGuidance}</Text>
              <Text style={styles.sectionLabel}>TERMINOLOGY</Text>
              {packContent.terminology.map((entry) => <Text key={entry.term} style={styles.term}><Text style={styles.termName}>{entry.term}:</Text> {entry.meaning}</Text>)}
              {packContent.advancedRubric && <View style={styles.rubric}><Text style={styles.sectionLabel}>PLUS · ADVANCED QUICK READ RUBRIC</Text>{packContent.advancedRubric.criteria.map((criterion) => <Text key={criterion.name} style={styles.term}><Text style={styles.termName}>{criterion.name}:</Text> {criterion.description}</Text>)}</View>}
              <Text style={styles.sectionLabel}>TARGETED DRILLS</Text>
              {packContent.drills.map((drill) => <Pressable accessibilityRole="button" disabled={busy} key={drill.id} onPress={() => {
                const topic = packContent.prompts.find((item) => item.id === drill.topicId);
                if (topic) onPractice(packContent, { ...topic, packId: pack.id });
              }} style={styles.drill}>
                <Text style={styles.drillTitle}>{drill.title}</Text><Text style={styles.drillText}>{drill.instruction}</Text>
              </Pressable>)}
              <Pressable accessibilityRole="button" onPress={() => onPractice(packContent, { ...packContent.pressureTest, packId: pack.id })} style={styles.pressureTest}>
                <Text style={styles.pressureTestText}>Start Pressure Test</Text>
              </Pressable>
            </View> : isOwned ? <View style={styles.loadingContent}><ActivityIndicator color="#18332d" /><Text style={styles.loadingText}>Checking your Pack access…</Text></View> : null}
            {isOwned ? <Pressable accessibilityRole="button" accessibilityLabel={`Practice ${pack.title}`} disabled={!packContent || busy} onPress={() => {
              const firstPrompt = packContent?.prompts[0];
              if (packContent && firstPrompt) onPractice(packContent, { ...firstPrompt, packId: pack.id });
            }} style={styles.primary}>
              <Text style={styles.primaryText}>{packContent ? `Practice ${pack.title}` : 'Loading Pack'}</Text>
            </Pressable> : <Pressable accessibilityRole="button" accessibilityLabel={`Buy ${pack.title}`} disabled={!purchaseOption || busy} onPress={() => void buy(pack.id)} style={[styles.primary, (!purchaseOption || busy) && styles.disabled]}>
              <Text style={styles.primaryText}>{busy ? 'Working…' : `Buy ${pack.title} · ${purchaseOption?.price ?? pack.priceFallback}`}</Text>
            </Pressable>}
          </View>;
        })}
        {message && <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text>}
        <Pressable accessibilityLabel="Restore purchases" accessibilityRole="button" disabled={busy} onPress={() => void restore()} style={styles.restore}>
          <Text style={styles.restoreText}>{busy ? 'Working…' : 'Restore purchases'}</Text>
        </Pressable>
      </ScrollView>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(24, 51, 45, 0.58)', flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#fffaf2', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '94%' },
  content: { gap: 18, padding: 22, paddingBottom: 38 },
  header: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  kicker: { color: '#e4572e', fontSize: 10, fontWeight: '900', letterSpacing: 1.7 },
  title: { color: '#18332d', fontFamily: 'Georgia', fontSize: 29, fontWeight: '700', marginTop: 5 },
  close: { color: '#526c63', fontWeight: '800', padding: 8 },
  intro: { color: '#526c63', fontSize: 14, lineHeight: 21 },
  packCard: { backgroundColor: '#f4ebdd', borderColor: '#d8caba', borderRadius: 18, borderWidth: 1, gap: 13, padding: 17 },
  packHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  packTitleGroup: { flex: 1, gap: 4 },
  packTitle: { color: '#18332d', fontFamily: 'Georgia', fontSize: 23, fontWeight: '700' },
  packTagline: { color: '#526c63', fontSize: 14, lineHeight: 19 },
  price: { color: '#18332d', fontSize: 17, fontWeight: '900' },
  packDescription: { color: '#526c63', fontSize: 14, lineHeight: 20 },
  categoryWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  category: { backgroundColor: '#fffaf2', borderRadius: 11, color: '#526c63', fontSize: 11, fontWeight: '700', overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 5 },
  oneTime: { color: '#799087', fontSize: 12, fontWeight: '700' },
  ownerContent: { borderTopColor: '#d8caba', borderTopWidth: 1, gap: 9, paddingTop: 13 },
  guidance: { color: '#526c63', fontSize: 13, lineHeight: 19 },
  term: { color: '#526c63', fontSize: 12, lineHeight: 17 },
  termName: { color: '#18332d', fontWeight: '900' },
  rubric: { backgroundColor: '#fffaf2', borderRadius: 12, gap: 6, padding: 11 },
  sectionLabel: { color: '#e4572e', fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
  drill: { backgroundColor: '#fffaf2', borderRadius: 12, gap: 4, padding: 11 },
  drillTitle: { color: '#18332d', fontSize: 14, fontWeight: '900' },
  drillText: { color: '#526c63', fontSize: 12, lineHeight: 17 },
  pressureTest: { alignItems: 'center', borderColor: '#18332d', borderRadius: 12, borderWidth: 1, justifyContent: 'center', minHeight: 44 },
  pressureTestText: { color: '#18332d', fontSize: 13, fontWeight: '900' },
  loadingContent: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  loadingText: { color: '#526c63', fontSize: 13 },
  primary: { alignItems: 'center', backgroundColor: '#18332d', borderRadius: 13, justifyContent: 'center', minHeight: 52, paddingHorizontal: 14 },
  primaryText: { color: '#fffaf2', fontSize: 14, fontWeight: '900', textAlign: 'center' },
  disabled: { opacity: 0.46 },
  message: { color: '#b03a22', fontSize: 13, lineHeight: 19 },
  restore: { alignItems: 'center', borderColor: '#c4b5a2', borderRadius: 12, borderWidth: 1, justifyContent: 'center', minHeight: 48 },
  restoreText: { color: '#18332d', fontSize: 14, fontWeight: '800' },
});
