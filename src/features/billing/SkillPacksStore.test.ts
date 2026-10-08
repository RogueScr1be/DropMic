import React from 'react';
import { act, create } from 'react-test-renderer';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/* eslint-disable import/first */

jest.mock('@/features/auth/auth-service', () => ({ getSession: jest.fn() }));
jest.mock('./skill-pack-service', () => ({ getOwnedSkillPackIds: jest.fn(), fetchSkillPackContent: jest.fn() }));
jest.mock('./plus-display', () => ({ getPlusDisplayEligibility: jest.fn(), syncRevenueCatEntitlement: jest.fn() }));
jest.mock('./revenuecat-adapter', () => ({
  revenueCatAdapter: { getOfferings: jest.fn(), purchasePackage: jest.fn(), restorePurchases: jest.fn() },
}));

import { getSession } from '@/features/auth/auth-service';
import { getOwnedSkillPackIds } from './skill-pack-service';
import { getPlusDisplayEligibility, syncRevenueCatEntitlement } from './plus-display';
import { revenueCatAdapter } from './revenuecat-adapter';
import { SkillPacksStore } from './SkillPacksStore';

const session = { user: { id: '11111111-1111-4111-8111-111111111111', is_anonymous: false } } as any;
const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockOwned = getOwnedSkillPackIds as jest.MockedFunction<typeof getOwnedSkillPackIds>;
const mockPlus = getPlusDisplayEligibility as jest.MockedFunction<typeof getPlusDisplayEligibility>;
const mockSync = syncRevenueCatEntitlement as jest.MockedFunction<typeof syncRevenueCatEntitlement>;
const mockOfferings = revenueCatAdapter.getOfferings as jest.MockedFunction<typeof revenueCatAdapter.getOfferings>;
const mockPurchase = revenueCatAdapter.purchasePackage as jest.MockedFunction<NonNullable<typeof revenueCatAdapter.purchasePackage>>;

async function renderStore(overrides: Partial<React.ComponentProps<typeof SkillPacksStore>> = {}) {
  const props: React.ComponentProps<typeof SkillPacksStore> = {
    ownedPackIds: [],
    onClose: jest.fn(),
    onOwnedPacksUpdated: jest.fn(),
    onPlusAccessUpdated: jest.fn(),
    onPractice: jest.fn(),
    visible: true,
    ...overrides,
  };
  let tree!: ReturnType<typeof create>;
  await act(async () => {
    tree = create(React.createElement(SkillPacksStore, props));
    await Promise.resolve();
  });
  return { tree, props };
}

describe('Skill Packs one-time purchase flow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetSession.mockResolvedValue(session);
    mockOfferings.mockResolvedValue({ current: { availablePackages: [
      { identifier: 'pack_interview_pro', product: { identifier: 'dropmic_pack_interview_pro', priceString: '$4.99' } },
      { identifier: 'pack_founder_pitch', product: { identifier: 'dropmic_pack_founder_pitch', priceString: '$4.99' } },
    ] } });
    mockPurchase.mockResolvedValue({ ok: true });
    mockOwned.mockResolvedValueOnce([]).mockResolvedValue(['interview_pro']);
    mockSync.mockResolvedValue(true);
    mockPlus.mockResolvedValue(false);
  });

  it('buys the exact custom package, reconciles server ownership, and keeps Plus separate', async () => {
    const { tree, props } = await renderStore();
    await act(async () => tree.root.findByProps({ accessibilityLabel: 'Buy Interview Pro' }).props.onPress());

    expect(mockPurchase).toHaveBeenCalledWith(session, 'pack_interview_pro', 'skill_packs');
    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(props.onOwnedPacksUpdated).toHaveBeenCalledWith(['interview_pro']);
    expect(props.onPlusAccessUpdated).toHaveBeenCalledWith(false);
    expect(tree.root.findByProps({ children: 'Interview Pro is now yours permanently.' })).toBeTruthy();
    expect(tree.root.findByProps({ children: 'Buy Founder Pitch · $4.99' })).toBeTruthy();
  });

  it('fails closed when the offering package is linked to a different store product', async () => {
    mockOfferings.mockResolvedValue({ current: { availablePackages: [
      { identifier: 'pack_interview_pro', product: { identifier: 'dropmic_plus_monthly', priceString: '$4.99' } },
    ] } });
    const { tree } = await renderStore();
    const button = tree.root.findByProps({ accessibilityLabel: 'Buy Interview Pro' });

    expect(button.props.disabled).toBe(true);
    expect(mockPurchase).not.toHaveBeenCalled();
  });
});
