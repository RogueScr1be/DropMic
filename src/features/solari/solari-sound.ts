import { useAudioPlayer } from 'expo-audio';
import { useCallback } from 'react';

const CLACK_WAV_BASE64 =
  'UklGRqQCAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YYACAAAAAKwl1iZmA7rdVtlz+dkeOCZ0CZbke9ro8/8XkiR3DmPrmtxv70oRAyJlEvbxkd8O7OIKrx45FSj4OOPH6e8Evhr1FtP9aOeS6JX/XBamF9YC8uti6PD6tRFbFxcHqvAh6Rj3+AwuFoEKYfW06h70Ugg+FAkN6/n47Any7QOwEasOIf7G79rw8P+rDmoP3QH18ofwe/xdC1UPBQVZ9v7wp/nwB4EOgAfE+SjyhveQBAoNRAkO/eTzIfZmARMLSwoPAA32d/WW/sEImgqoAn34fvU6/D0GQQrABAr7JPZq+rEDVQlFBo39T/cy+UEB8wcwB+D/4PiU+BP/PQaDB+QBs/qK+ED9VgRIB4EDo/wF+d37ZQKSBqYEjf7w+ff6iwB6BUwFTgAt+5H66f4fBHUFzQGd/KP6lP2iAioF8gIf/iD7ofwkAYAEsgOT//P7FvzC/4wDCATcAAD99PuW/mwC+QPlASv+Mfy0/T0BkQOeAlf/v/wm/RsA4wL/AmgAhv3x/CD/CAIKA0oBb/4P/Vz+GAHGAuwBX/90/d79LgBFAkUCPgAN/qr9YP+ZAVUC9wDG/rz9v/7ZACMCfAGH/wv+WP4cALsBxAE6AIf+MP54/y8BzgHNAB7/Qv75/pQAoQE0Abn/h/6s/v7/RwFnAUcA8f6T/nz/0gBmAbkAbf+s/h3/UwA4AQIB6//t/un+3P/nACABWQBK/+L+ef+DABIBrACy/wP/N/8bAOEA3AAVAEL/G/+//5YA5QBoAJT/JP94/0EAzACgAOr/TP9Q/+//mAC4ADYAif9I/6r/VACwAHAA0P9e/33/DACOAJAAFACK/2v/zv9aAJQASwDE/3T/';

const CLACK_SOUND_SOURCE = `data:audio/wav;base64,${CLACK_WAV_BASE64}`;

export function useClackSound(enabled: boolean) {
  const player = useAudioPlayer(CLACK_SOUND_SOURCE);

  const playClack = useCallback(() => {
    if (!enabled) {
      return;
    }

    void player
      .seekTo(0)
      .then(() => player.play())
      .catch(() => undefined);
  }, [enabled, player]);

  return playClack;
}
