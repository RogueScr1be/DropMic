import { useRef, useState } from 'react';

import { ActionButton } from '@/ui/ActionButton';

export function ChallengeShareAction({
  eligible,
  onError,
  onShare,
}: {
  eligible: boolean;
  onError: (message: string) => void;
  onShare: () => Promise<void>;
}) {
  const [isSharing, setIsSharing] = useState(false);
  const inFlight = useRef(false);

  if (!eligible) {
    return null;
  }

  const handlePress = async () => {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    setIsSharing(true);
    try {
      await onShare();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'The challenge share could not be prepared.');
    } finally {
      inFlight.current = false;
      setIsSharing(false);
    }
  };

  return (
    <ActionButton
      accessibilityHint="Creates one challenge link and opens the share sheet."
      disabled={isSharing}
      label={isSharing ? 'Creating Challenge…' : 'Share a Challenge'}
      onPress={() => void handlePress()}
      secondary
      testID="share-challenge-button"
    />
  );
}
