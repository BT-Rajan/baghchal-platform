import { Platform, Share } from 'react-native';

import { t } from '@/i18n';
import { shareLink } from '@/lobby/format';

import { Button } from './Button';

/** Whether this device can offer its share sheet (the apps always; browsers that have one). */
export function canShare(os: string = Platform.OS): boolean {
  if (os !== 'web') return true;
  return typeof (globalThis as { navigator?: { share?: unknown } }).navigator?.share === 'function';
}

/**
 * The one way to share a link (a challenge, a tournament): the device's share sheet, with the
 * full address from `shareLink`. Where there is no share sheet (most desktop browsers) it is not
 * shown: the link beside it is selectable, to copy.
 */
export function ShareButton({
  path,
  title,
}: {
  path: string;
  /** The accessible name. */ title?: string;
}) {
  if (!canShare()) return null;
  const url = shareLink(path);
  const share = () => {
    // iOS shares `url` as a link; Android and browsers share the message.
    Share.share(Platform.OS === 'ios' ? { url } : { message: url }).catch((error: unknown) =>
      console.warn('Could not share the link', error),
    );
  };
  return (
    <Button
      title={title ?? t('Share the link')}
      label={t('Share')}
      variant="secondary"
      onPress={share}
    />
  );
}
