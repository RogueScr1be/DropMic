export type ResponsiveInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type ResponsiveLayout = {
  compactHeight: boolean;
  contentMaxWidth: number;
  fontScale: number;
  horizontalPadding: number;
  isLandscape: boolean;
  isTablet: boolean;
  solariDensity: 'compact-landscape' | 'phone' | 'tablet';
  stackControls: boolean;
  usableHeight: number;
  usableWidth: number;
  useTwoColumns: boolean;
};

const emptyInsets: ResponsiveInsets = { top: 0, right: 0, bottom: 0, left: 0 };

export function responsiveLayout({
  fontScale = 1,
  height,
  insets = emptyInsets,
  width,
}: {
  fontScale?: number;
  height: number;
  insets?: ResponsiveInsets;
  width: number;
}): ResponsiveLayout {
  const usableWidth = Math.max(0, width - insets.left - insets.right);
  const usableHeight = Math.max(0, height - insets.top - insets.bottom);
  const shortestSide = Math.min(usableWidth, usableHeight);
  const isLandscape = usableWidth > usableHeight;
  const isTablet = shortestSide >= 600;
  const compactHeight = usableHeight < 620;
  const largeText = fontScale >= 1.35;
  const horizontalPadding = isTablet ? 32 : usableWidth < 360 ? 14 : 20;
  const contentMaxWidth = isTablet && isLandscape ? 1200 : isTablet ? 940 : 680;
  const useTwoColumns = !largeText && isTablet && isLandscape && usableHeight >= 700;
  const solariDensity = isTablet ? 'tablet' : compactHeight && isLandscape ? 'compact-landscape' : 'phone';

  return {
    compactHeight,
    contentMaxWidth,
    fontScale,
    horizontalPadding,
    isLandscape,
    isTablet,
    solariDensity,
    stackControls: largeText || usableWidth < 340,
    usableHeight,
    usableWidth,
    useTwoColumns,
  };
}
