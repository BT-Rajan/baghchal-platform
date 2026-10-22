import { useMutation } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import type { TextInputInstance } from 'react-native';

import { useSession } from '@/auth/session';
import { checkNewPassword, isLinkToken } from '@/auth/validation';
import { Button } from '@/components/Button';
import { useFormErrors } from '@/components/form';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { TextLink } from '@/components/TextLink';
import { t } from '@/i18n';

const FIELDS = ['password', 'confirm'] as const;
const CODE_FIELDS = { weak_password: 'password' } as const;

/** Opened from the link in the password-reset email: `/reset-password?token=…`. */
export default function ResetPassword() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { session } = useSession();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const confirmField = useRef<TextInputInstance>(null);
  const reset = useMutation({
    mutationFn: async (linkToken: string) => {
      await session.api.confirmPasswordReset(linkToken, password);
      // The server ended every session of this account, this one included.
      if (session.getState().status === 'signedIn') await session.forget();
    },
  });
  const { fieldError, formMessage, accept } = useFormErrors(FIELDS, reset.error, CODE_FIELDS);

  if (!isLinkToken(token)) {
    return (
      <Screen title={t('Choose a new password')} brand>
        <Notice tone="error">{t('This link is invalid or has expired.')}</Notice>
        <TextLink href="/forgot-password">{t('Request a new link')}</TextLink>
      </Screen>
    );
  }

  if (reset.isSuccess) {
    return (
      <Screen title={t('Password changed')} brand>
        <Notice tone="success">
          {t('Signed out everywhere. Sign in with the new one.')}
        </Notice>
        <Button title={t('Sign in')} large onPress={() => router.replace('/sign-in')} />
      </Screen>
    );
  }

  const submit = () => {
    reset.reset();
    if (accept(checkNewPassword({ password, confirm }))) reset.mutate(token);
  };

  return (
    <Screen title={t('Choose a new password')} brand>
      {formMessage !== null && <Notice tone="error">{formMessage}</Notice>}
      <TextField
        label={t('New password')}
        value={password}
        onChangeText={setPassword}
        error={fieldError('password')}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => confirmField.current?.focus()}
      />
      <TextField
        ref={confirmField}
        label={t('Repeat the new password')}
        value={confirm}
        onChangeText={setConfirm}
        error={fieldError('confirm')}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Button title={t('Change password')} large onPress={submit} busy={reset.isPending} />
      {reset.error !== null && (
        <TextLink href="/forgot-password">{t('Request a new link')}</TextLink>
      )}
    </Screen>
  );
}
