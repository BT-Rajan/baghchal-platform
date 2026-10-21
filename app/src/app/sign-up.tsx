import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';

import { useApi } from '@/auth/session';
import { AccountForm, type AccountDetails } from '@/components/AccountForm';
import { withAge } from '@/legal/agreement';
import { Button } from '@/components/Button';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { ResendConfirmation } from '@/components/ResendConfirmation';
import { TextLink } from '@/components/TextLink';
import { t } from '@/i18n';

export default function SignUp() {
  const api = useApi();
  const register = useMutation({
    mutationFn: (details: AccountDetails) => api.register(withAge(details)),
  });

  if (register.isSuccess) {
    return (
      <Screen title={t('Check your email')} brand>
        <Notice tone="success">
          {t('We sent a link to {email}. Open it to confirm your address, then sign in.', {
            email: register.variables.email,
          })}
        </Notice>
        <Button title={t('Sign in')} onPress={() => router.replace('/sign-in')} />
        <ResendConfirmation email={register.variables.email} />
      </Screen>
    );
  }

  return (
    <Screen title={t('Create an account')} brand>
      <AccountForm action={register} submitTitle={t('Create account')} />
      <TextLink href="/sign-in">{t('Already have an account? Sign in')}</TextLink>
    </Screen>
  );
}
