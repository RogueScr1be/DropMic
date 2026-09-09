import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing } from './theme';
import { responsiveLayout, type ResponsiveLayout } from './responsive';

export function AppShell({
  children,
  header,
}: {
  children: (layout: ResponsiveLayout) => ReactNode;
  header: ReactNode;
}) {
  const { fontScale, height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const layout = responsiveLayout({ fontScale, height, insets, width });

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={[
          styles.scrollContent,
          {
            minHeight: layout.usableHeight,
            paddingHorizontal: layout.horizontalPadding,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        testID="app-shell-scroll">
        <View style={[styles.frame, { maxWidth: layout.contentMaxWidth }]}>
          {header}
          <View style={styles.content} testID="app-shell-content">
            {children(layout)}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: colors.background, flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: spacing.xxxl, paddingTop: spacing.sm },
  frame: { alignSelf: 'center', flex: 1, width: '100%' },
  content: { flex: 1, paddingTop: spacing.lg },
});
