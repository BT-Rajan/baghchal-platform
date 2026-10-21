import { Stack } from 'expo-router';

import { t } from '@/i18n';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { TextLink } from '@/components/TextLink';

export default function NotFound() {
  return (
    <Screen title={t('Page not found')}>
      <Stack.Screen options={{ title: t('Page not found') }} />
      <Notice tone="info">{t('There is nothing at this address.')}</Notice>
      <TextLink href="/">{t('Go to the lobby')}</TextLink>
    </Screen>
  );
}
