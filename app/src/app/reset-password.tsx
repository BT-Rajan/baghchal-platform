import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { useSession } from '@/auth/session';
import { checkNewPassword, isLinkToken } from '@/auth/validation';
import { Button } from '@/components/Button';
import { useFormErrors } from '@/components/form';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { TextLink } from '@/components/TextLink';

const FIELDS = ['password', 'confirm'] as const;
const CODE_FIELDS = { weak_password: 'password' } as const;

/** Opened from the link in the password-reset email: `/reset-password?token=…`. */
export default function ResetPassword() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { session } = useSession();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
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
      <Screen title="Choose a new password">
        <Notice tone="error">This link is invalid or has expired.</Notice>
        <TextLink href="/forgot-password">Request a new link</TextLink>
      </Screen>
    );
  }

  if (reset.isSuccess) {
    return (
      <Screen title="Password changed">
        <Notice tone="success">
          Your password has been changed and you have been signed out everywhere.
        </Notice>
        <TextLink href="/sign-in">Sign in</TextLink>
      </Screen>
    );
  }

  const submit = () => {
    reset.reset();
    if (accept(checkNewPassword({ password, confirm }))) reset.mutate(token);
  };

  return (
    <Screen title="Choose a new password">
      {formMessage !== null && <Notice tone="error">{formMessage}</Notice>}
      <TextField
        label="New password"
        value={password}
        onChangeText={setPassword}
        error={fieldError('password')}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <TextField
        label="Repeat the new password"
        value={confirm}
        onChangeText={setConfirm}
        error={fieldError('confirm')}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        onSubmitEditing={submit}
      />
      <Button title="Change password" onPress={submit} busy={reset.isPending} />
      {reset.error !== null && <TextLink href="/forgot-password">Request a new link</TextLink>}
    </Screen>
  );
}
