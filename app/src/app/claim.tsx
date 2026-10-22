import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';

import { useApi, useSession } from '@/auth/session';
import { AccountForm, type AccountDetails } from '@/components/AccountForm';
import { Button } from '@/components/Button';
import { Hint } from '@/components/Card';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { t } from '@/i18n';

/** A guest makes a real account, keeping their games. */
export default function Claim() {
  const api = useApi();
  const { session } = useSession();
  const claim = useMutation({
    mutationFn: async (details: AccountDetails) => {
      await api.claimAccount(details);
      await session.refresh();
    },
  });

  if (claim.isSuccess) {
    return (
      <Screen title={t('Welcome, {name}!', { name: claim.variables.username })}>
        <Notice tone="success">{t('Your account is ready. Your games are kept.')}</Notice>
        <Button title={t('Make it yours')} onPress={() => router.replace('/make-it-yours')} />
        <Button
          title={t('Back to playing')}
          variant="secondary"
          onPress={() => router.navigate('/')}
        />
      </Screen>
    );
  }

  return (
    <Screen title={t('Make a free account')}>
      <Hint>{t('Keep your games and play rated games.')}</Hint>
      <AccountForm action={claim} submitTitle={t('Make my account')} />
    </Screen>
  );
}
