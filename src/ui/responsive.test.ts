import { describe, expect, it } from '@jest/globals';

import { responsiveLayout } from './responsive';

describe('responsive layout', () => {
  it('classifies phone portrait and compact landscape deterministically', () => {
    const portrait = responsiveLayout({ width: 390, height: 844, fontScale: 1 });
    const landscape = responsiveLayout({ width: 844, height: 390, fontScale: 1 });

    expect(portrait).toMatchObject({ isLandscape: false, isTablet: false, solariDensity: 'phone', useTwoColumns: false });
    expect(landscape).toMatchObject({ compactHeight: true, isLandscape: true, isTablet: false, solariDensity: 'compact-landscape', useTwoColumns: false });
  });

  it('gives iPad portrait a bounded canvas and landscape two columns', () => {
    const portrait = responsiveLayout({ width: 834, height: 1194, fontScale: 1 });
    const landscape = responsiveLayout({ width: 1194, height: 834, fontScale: 1 });

    expect(portrait).toMatchObject({ contentMaxWidth: 940, isTablet: true, solariDensity: 'tablet', useTwoColumns: false });
    expect(landscape).toMatchObject({ contentMaxWidth: 1200, isTablet: true, solariDensity: 'tablet', useTwoColumns: true });
  });

  it('reflows large text instead of preserving constrained columns', () => {
    const layout = responsiveLayout({ width: 1194, height: 834, fontScale: 1.6 });

    expect(layout.stackControls).toBe(true);
    expect(layout.useTwoColumns).toBe(false);
    expect(layout.usableHeight).toBe(834);
  });

  it('collapses a short tablet landscape and preserves the broad canvas', () => {
    const layout = responsiveLayout({ width: 1194, height: 680, fontScale: 1 });

    expect(layout).toMatchObject({ contentMaxWidth: 1200, isTablet: true, useTwoColumns: false });
  });

  it('subtracts safe-area insets from usable dimensions', () => {
    const layout = responsiveLayout({
      width: 844,
      height: 390,
      insets: { top: 0, right: 47, bottom: 21, left: 47 },
    });

    expect(layout.usableWidth).toBe(750);
    expect(layout.usableHeight).toBe(369);
  });
});
