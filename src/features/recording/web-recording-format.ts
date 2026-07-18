export const WEB_RECORDING_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
] as const;

export type MimeTypeSupport = (mimeType: string) => boolean;

export function detectWebRecordingMimeType(
  isTypeSupported: MimeTypeSupport | undefined =
    typeof MediaRecorder === 'undefined' ? undefined : MediaRecorder.isTypeSupported.bind(MediaRecorder),
) {
  if (!isTypeSupported) {
    return null;
  }

  return WEB_RECORDING_MIME_TYPES.find((mimeType) => isTypeSupported(mimeType)) ?? null;
}
