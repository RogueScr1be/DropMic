import { Alert } from 'react-native';
import { useRef, useState } from 'react';

import { ActionButton } from '@/ui/ActionButton';

export function ChallengeShareAction({
  eligible,
  mode = 'create',
  onError,
  onShare,
}: {
  eligible: boolean;
  mode?: 'create' | 'reuse';
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
      accessibilityHint={mode === 'reuse' ? 'Reopens the existing challenge share sheet.' : 'Creates one challenge link and opens the share sheet.'}
      disabled={isSharing}
      label={isSharing ? (mode === 'reuse' ? 'Opening Share Sheet…' : 'Creating Challenge…') : mode === 'reuse' ? 'Share Challenge Again' : 'Share a Challenge'}
      onPress={() => void handlePress()}
      secondary
      testID="share-challenge-button"
    />
  );
}

export function ChallengeRecoveryAction({
  disabled = false,
  onError,
  onRecover,
}: {
  disabled?: boolean;
  onError: (message: string) => void;
  onRecover: () => Promise<void>;
}) {
  const [isRecovering, setIsRecovering] = useState(false);
  const warningShown = useRef(false);

  const confirmRecovery = async () => {
    if (isRecovering) {
      return;
    }
    setIsRecovering(true);
    try {
      await onRecover();
    } catch (error) {
      onError(error instanceof Error ? error.message : 'The challenge link could not be regenerated.');
    } finally {
      warningShown.current = false;
      setIsRecovering(false);
    }
  };

  const handlePress = () => {
    if (disabled || isRecovering || warningShown.current) {
      return;
    }
    warningShown.current = true;
    Alert.alert(
      'Regenerate Share Link?',
      'The previous challenge link will stop working. Your existing challenge will remain active with a new link.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: () => {
            warningShown.current = false;
          },
        },
        {
          text: 'Regenerate Share Link',
          style: 'destructive',
          onPress: () => void confirmRecovery(),
        },
      ],
    );
  };

  return (
    <ActionButton
      accessibilityHint="Stops the previous challenge link and creates one replacement link."
      disabled={disabled || isRecovering}
      label={isRecovering ? 'Regenerating Share Link…' : 'Regenerate Share Link'}
      onPress={handlePress}
      secondary
      testID="regenerate-share-link-button"
    />
  );
}
