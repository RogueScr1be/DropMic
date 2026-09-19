import { readFileSync } from 'node:fs';
import { describe, expect, it } from '@jest/globals';

const appSource = readFileSync('src/app/index.tsx', 'utf8');
const quickReadSource = readFileSync('src/features/quick-read/QuickReadFlow.tsx', 'utf8');

describe('QA8A Quick Read presentation contract', () => {
  it('uses one completion activation and preserves consent for other entries', () => {
    expect(appSource).toContain('onQuickRead={openQuickRead}');
    expect(appSource).toContain('label={quickReadStarting ? \'Starting Quick Read…\' : \'Upload & get my Quick Read\'}');
    expect(appSource).toContain('setQuickReadAutoStart(true)');
    expect(appSource).toContain('autoStart={quickReadAutoStart}');
    expect(quickReadSource).toContain('autoStart = false');
    expect(quickReadSource).toContain('if (!autoStart || autoStartHandled.current)');
    expect(quickReadSource).toContain('runInFlight.current');
  });

  it('keeps Settings owned by Quick Read state and preserves internal concision fields', () => {
    expect(appSource).toContain('const quickReadOwnsSettings = isQuickReadVisible;');
    expect(appSource).toContain('if (quickReadOwnsSettings)');
    expect(appSource).toContain('settingsHidden={settingsHidden}');
    expect(quickReadSource).toContain('Directness');
    expect(quickReadSource).toContain('currentResult.concision');
    expect(quickReadSource).toContain('scores.concision');
  });

  it('uses the streamlined customer-facing states', () => {
    expect(quickReadSource).toContain('Upload your Drop for analysis of clarity, structure, specificity, and concise word usage.');
    expect(quickReadSource).toContain('<DropWait reducedMotion={reducedMotion} />');
    expect(quickReadSource).toContain('Here’s your Quick Read.');
    expect(quickReadSource).not.toContain('PRIVATE PROCESSING');
    expect(quickReadSource).not.toContain('A focused signal for the next take—not a verdict.');
  });
});
