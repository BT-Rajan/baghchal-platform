import { useState } from 'react';
import { Platform, Share, StyleSheet, View } from 'react-native';

import { t } from '@/i18n';
import { shareLink } from '@/lobby/format';
import { spacing } from '@/theme';

import { Button } from './Button';
import { Notice } from './Notice';

type Nav = { share?: unknown; clipboard?: { writeText?: unknown } };
const nav = () => (globalThis as { navigator?: Nav }).navigator;

/** Whether this device can offer its share sheet (the apps always; browsers that have one). */
export function canShare(os: string = Platform.OS): boolean {
  if (os !== 'web') return true;
  return typeof nav()?.share === 'function';
}

/** Whether a browser can copy text for the player (its clipboard, or the older copy command). */
export function canCopy(): boolean {
  return (
    typeof nav()?.clipboard?.writeText === 'function' ||
    typeof (globalThis as { document?: { execCommand?: unknown } }).document?.execCommand ===
      'function'
  );
}

/** Puts `text` on the clipboard: the browser's clipboard, else the older copy command. */
export async function copyText(text: string): Promise<void> {
  const clipboard = nav()?.clipboard as { writeText?: (text: string) => Promise<void> } | undefined;
  if (typeof clipboard?.writeText === 'function') {
    await clipboard.writeText(text);
    return;
  }
  const page = (globalThis as { document?: Document }).document;
  if (page === undefined) throw new Error('nothing to copy with');
  const field = page.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  page.body.appendChild(field);
  field.select();
  const copied = page.execCommand('copy');
  page.body.removeChild(field);
  if (!copied) throw new Error('copy refused');
}

/** The player closed the share sheet: nothing went wrong. */
function cancelled(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

/**
 * The one way to share a link (a challenge, a tournament), with the full address from
 * `shareLink`: the device's share sheet, or, where there is none (most desktop browsers), a
 * button that copies it. Closing the share sheet is not a failure; a real one is said.
 */
export function ShareButton({
  path,
  title,
  variant = 'secondary',
}: {
  path: string;
  /** The accessible name. */
  title?: string;
  /** `primary` where sharing is the screen's main action (a link just made). */
  variant?: 'primary' | 'secondary';
}) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const sheet = canShare();
  if (!sheet && !canCopy()) return null;
  const url = shareLink(path);
  const share = () => {
    setState('idle');
    // iOS shares `url` as a link; Android and browsers share the message.
    Share.share(Platform.OS === 'ios' ? { url } : { message: url }).catch((error: unknown) => {
      if (!cancelled(error)) setState('failed');
    });
  };
  const copy = () => {
    setState('idle');
    copyText(url).then(
      () => setState('copied'),
      () => setState('failed'),
    );
  };
  return (
    <View style={styles.box}>
      {sheet ? (
        <Button
          title={title ?? t('Share the link')}
          label={t('Share')}
          variant={variant}
          onPress={share}
        />
      ) : (
        <Button
          title={t('Copy the link')}
          label={state === 'copied' ? t('Copied') : t('Copy')}
          variant={variant}
          onPress={copy}
        />
      )}
      {state === 'failed' && (
        <Notice tone="error">
          {sheet
            ? t('The link could not be shared. Select it to copy it instead.')
            : t('The link could not be copied. Select it to copy it instead.')}
        </Notice>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: spacing.sm },
});
