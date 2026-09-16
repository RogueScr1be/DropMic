import { readFileSync } from 'node:fs';
import { describe, expect, it } from '@jest/globals';

const source = readFileSync('src/app/index.tsx', 'utf8');

describe('QA7-A app copy and layout contracts', () => {
  it('uses Drop copy and removes the old completion/delete wording', () => {
    expect(source).toContain('<Text style={styles.completionBody}>Drop Saved</Text>');
    expect(source).toContain("isPlaybackPlaying ? 'Pause' : 'Play Drop'");
    expect(source).toContain('label="Retry Drop"');
    expect(source).toContain('label="Delete Drop"');
    expect(source).toContain('Delete this Drop?');
    expect(source).toContain('label="Keep Drop"');
    expect(source).not.toContain('Play recording');
    expect(source).not.toContain('Retry recording');
    expect(source).not.toContain('Delete recording');
    expect(source).not.toContain('Delete this recording?');
    expect(source).not.toContain('Keep recording');
    expect(source).not.toContain('Delete Recording');
  });

  it('keeps Flow and Saved Drop in one vertically spaced flow stack', () => {
    expect(source).toContain('flowStack: { gap: spacing.md, width: \'100%\' }');
    expect(source).toMatch(/<View style=\{styles\.flowStack\} testID="flow-region">\s*<MicFlowCard[\s\S]*?\{retainedTakeCard\}/);
    expect(source).toContain('SAVED DROP');
    expect(source).toContain('label="Resume Saved Drop"');
    expect(source).not.toContain('A local recording is saved for later.');
    expect(source).not.toContain('SAVED TAKE');
    expect(source).not.toContain('Resume saved take');
  });
});
