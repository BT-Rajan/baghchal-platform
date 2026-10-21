import { router, Stack } from 'expo-router';

import { t } from '@/i18n';
import { Button } from '@/components/Button';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';

export default function NotFound() {
  return (
    <Screen title={t('Page not found')}>
      <Stack.Screen options={{ title: t('Page not found') }} />
      <Notice tone="info">{t('There is nothing at this address.')}</Notice>
      <Button title={t('Go to Play')} onPress={() => router.replace('/')} />
    </Screen>
  );
}
