import { describe, expect, it } from '@jest/globals';

import { detectWebRecordingMimeType } from './web-recording-format';

describe('web recording format detection', () => {
  it('selects the first runtime-supported MIME type', () => {
    expect(
      detectWebRecordingMimeType((mimeType) => mimeType === 'audio/mp4;codecs=mp4a.40.2'),
    ).toBe('audio/mp4;codecs=mp4a.40.2');
  });

  it('returns null when the browser reports no supported audio format', () => {
    expect(detectWebRecordingMimeType(() => false)).toBeNull();
  });
});
