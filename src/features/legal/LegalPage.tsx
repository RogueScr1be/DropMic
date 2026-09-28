import { Link } from 'expo-router';
import Head from 'expo-router/head';
import { Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '@/ui/theme';

export type LegalSection = {
  title: string;
  paragraphs: string[];
};

export function LegalPage({ description, sections, title }: { description: string; sections: LegalSection[]; title: string }) {
  return <SafeAreaView style={styles.safe}>
    <Head>
      <title>{`${title} | DropMic`}</title>
      <meta name="description" content={description} />
    </Head>
    <ScrollView contentContainerStyle={styles.content}>
      <Link href="/" asChild>
        <Pressable accessibilityRole="link" style={styles.back}><Text style={styles.backText}>← DropMic</Text></Pressable>
      </Link>
      <Text style={styles.kicker}>DROPMIC</Text>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      <Text style={styles.operator}>Operated by Prentiss Whitley</Text>
      {sections.map((section) => <View key={section.title} style={styles.section}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>{section.title}</Text>
        {section.paragraphs.map((paragraph) => <Text key={paragraph} style={styles.body}>{paragraph}</Text>)}
      </View>)}
      <Text style={styles.contact}>Questions? Contact <Text style={styles.contactAddress}>support@thedropmic.com</Text>.</Text>
      <Text style={styles.updated}>Last updated September 28, 2026.</Text>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.background, flex: 1 },
  content: { alignSelf: 'center', gap: spacing.lg, maxWidth: 760, padding: spacing.xxl, width: '100%' },
  back: { alignSelf: 'flex-start', paddingVertical: spacing.sm },
  backText: { color: colors.coral, ...typography.label },
  kicker: { color: colors.coral, ...typography.eyebrow },
  title: { color: colors.ink, fontFamily: typography.displayFamily, fontSize: 46, fontWeight: '700', lineHeight: 54 },
  operator: { color: colors.muted, fontSize: 15, lineHeight: 22 },
  section: { gap: spacing.sm, marginTop: spacing.md },
  sectionTitle: { color: colors.ink, fontFamily: typography.displayFamily, fontSize: 24, fontWeight: '700', lineHeight: 30 },
  body: { color: colors.muted, fontSize: 16, lineHeight: 25 },
  contact: { borderTopColor: colors.border, borderTopWidth: 1, color: colors.muted, fontSize: 15, lineHeight: 23, marginTop: spacing.lg, paddingTop: spacing.lg },
  contactAddress: { color: colors.coral, fontWeight: '700' },
  updated: { color: colors.muted, fontSize: 13, lineHeight: 20 },
});
