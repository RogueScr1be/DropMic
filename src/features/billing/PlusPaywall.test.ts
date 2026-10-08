import React from 'react';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import { describe, expect, it, jest, beforeEach } from '@jest/globals';

/* eslint-disable import/first */

jest.mock('@/features/auth/auth-service', () => ({ getSession: jest.fn() }));
jest.mock('@/features/analytics/analytics', () => ({ trackEvent: jest.fn() }));
jest.mock('./revenuecat-adapter', () => ({
  revenueCatAdapter: {
    getOfferings: jest.fn(),
    purchasePackage: jest.fn(),
    restorePurchases: jest.fn(),
    presentCustomerCenter: jest.fn(),
  },
}));
jest.mock('./plus-display', () => ({
  getPlusDisplayEligibility: jest.fn(),
  syncRevenueCatEntitlement: jest.fn(),
}));

import { getSession } from '@/features/auth/auth-service';
import { getPlusDisplayEligibility, syncRevenueCatEntitlement } from './plus-display';
import { PlusPaywall } from './PlusPaywall';
import { revenueCatAdapter } from './revenuecat-adapter';

const session = { user: { id: '11111111-1111-4111-8111-111111111111', is_anonymous: false } } as any;
const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockEligibility = getPlusDisplayEligibility as jest.MockedFunction<typeof getPlusDisplayEligibility>;
const mockSync = syncRevenueCatEntitlement as jest.MockedFunction<typeof syncRevenueCatEntitlement>;
const mockOfferings = revenueCatAdapter.getOfferings as jest.MockedFunction<typeof revenueCatAdapter.getOfferings>;
const mockPurchase = revenueCatAdapter.purchasePackage as jest.MockedFunction<NonNullable<typeof revenueCatAdapter.purchasePackage>>;
const mockRestore = revenueCatAdapter.restorePurchases as jest.MockedFunction<NonNullable<typeof revenueCatAdapter.restorePurchases>>;

async function renderPaywall(onAccessUpdated = jest.fn()) {
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(React.createElement(PlusPaywall, { onAccessUpdated, onClose: jest.fn(), visible: true }));
  });
  return { tree, onAccessUpdated };
}

describe('Plus paywall purchase verification', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue(session);
    mockOfferings.mockResolvedValue({ current: { availablePackages: [{
      identifier: 'monthly', product: { identifier: 'dropmic_plus_monthly', title: 'Monthly', priceString: '$4.99', description: 'Monthly Plus' },
    }] } });
    mockPurchase.mockResolvedValue({ ok: true });
    mockRestore.mockResolvedValue({ ok: true });
    mockSync.mockResolvedValue(true);
    mockEligibility.mockResolvedValue(true);
  });

  it('refreshes Plus only after the server confirms a successful purchase', async () => {
    const { tree, onAccessUpdated } = await renderPaywall();
    const button = tree.root.findByProps({ accessibilityLabel: 'Purchase Plus' });

    await act(async () => button.props.onPress());

    expect(mockPurchase).toHaveBeenCalledWith(session, 'monthly');
    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(mockEligibility).toHaveBeenCalledTimes(1);
    expect(onAccessUpdated).toHaveBeenCalledWith(true);
    expect(tree.root.findByProps({ children: 'Purchase complete. Plus is active on your account.' })).toBeTruthy();
  });

  it('does not enable Plus when the server sync cannot verify a completed store purchase', async () => {
    mockSync.mockResolvedValueOnce(false);
    const { tree, onAccessUpdated } = await renderPaywall();
    const button = tree.root.findByProps({ accessibilityLabel: 'Purchase Plus' });

    await act(async () => button.props.onPress());

    expect(mockEligibility).not.toHaveBeenCalled();
    expect(onAccessUpdated).toHaveBeenCalledWith(false);
    expect(tree.root.findByProps({ children: 'Purchase complete. Store verification is still processing; Plus will appear after confirmation.' })).toBeTruthy();
  });

  it('reports restore errors without unlocking access', async () => {
    mockRestore.mockRejectedValueOnce(new Error('store unavailable'));
    const { tree, onAccessUpdated } = await renderPaywall();
    const button = tree.root.findByProps({ accessibilityLabel: 'Restore purchases' });

    await act(async () => button.props.onPress());

    expect(mockSync).not.toHaveBeenCalled();
    expect(onAccessUpdated).not.toHaveBeenCalled();
    expect(tree.root.findByProps({ children: 'Restore is unavailable right now.' })).toBeTruthy();
  });

  it('does not surface the retired lifetime product or unrelated offerings', async () => {
    mockOfferings.mockResolvedValue({ current: { availablePackages: [
      { identifier: 'lifetime', product: { identifier: 'dropmic_plus_lifetime', title: 'Lifetime', priceString: '$19.99' } },
      { identifier: 'pack', product: { identifier: 'dropmic_pack_interview_pro', title: 'Interview Pro', priceString: '$4.99' } },
      { identifier: 'annual', product: { identifier: 'dropmic_plus_annual', title: 'Annual', priceString: '$29.99' } },
    ] } });
    const { tree } = await renderPaywall();
    const labels = tree.root.findAll((node) => node.props.accessibilityRole === 'radio').map((node) => node.findAllByType(Text)[0].props.children);
    expect(labels).toContain('Annual');
    expect(labels).not.toContain('Lifetime');
    expect(labels).not.toContain('Interview Pro');
  });
});
