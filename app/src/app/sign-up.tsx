import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';

import { useApi } from '@/auth/session';
import { AccountForm, type AccountDetails } from '@/components/AccountForm';
import { Button } from '@/components/Button';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { ResendConfirmation } from '@/components/ResendConfirmation';
import { TextLink } from '@/components/TextLink';
import { t } from '@/i18n';

export default function SignUp() {
  const api = useApi();
  const register = useMutation({
    mutationFn: (details: AccountDetails) => api.register(details),
  });

  if (register.isSuccess) {
    return (
      <Screen title={t('Check your email')} brand>
        <Notice tone="success">
          {t('We sent an email to {email}. Open the link in it to start playing.', {
            email: register.variables.email,
          })}
        </Notice>
        <ResendConfirmation email={register.variables.email} main />
        <Button
          title={t('Back to sign in')}
          variant="secondary"
          onPress={() => router.replace('/sign-in')}
        />
      </Screen>
    );
  }

  return (
    <Screen title={t('Make a free account')} brand>
      <AccountForm action={register} submitTitle={t('Accept and make my account')} />
      <TextLink href="/sign-in">{t('Already have an account? Sign in')}</TextLink>
    </Screen>
  );
}
