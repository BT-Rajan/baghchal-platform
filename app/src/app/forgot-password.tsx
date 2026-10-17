import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { useApi } from '@/auth/session';
import { checkEmail } from '@/auth/validation';
import { Button } from '@/components/Button';
import { useFormErrors } from '@/components/form';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { TextLink } from '@/components/TextLink';

const FIELDS = ['email'] as const;

export default function ForgotPassword() {
  const api = useApi();
  const [email, setEmail] = useState('');
  const request = useMutation({ mutationFn: () => api.requestPasswordReset(email.trim()) });
  const { fieldError, formMessage, accept } = useFormErrors(FIELDS, request.error);

  const submit = () => {
    request.reset();
    if (accept(checkEmail({ email }))) request.mutate();
  };

  if (request.isSuccess) {
    return (
      <Screen title="Check your email">
        <Notice tone="success">
          {`If ${email.trim()} belongs to an account, we sent it a link to choose a new password.`}
        </Notice>
        <TextLink href="/sign-in">Back to sign in</TextLink>
      </Screen>
    );
  }

  return (
    <Screen title="Reset your password">
      {formMessage !== null && <Notice tone="error">{formMessage}</Notice>}
      <TextField
        label="Email"
        value={email}
        onChangeText={setEmail}
        error={fieldError('email')}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        onSubmitEditing={submit}
      />
      <Button title="Email me a link" onPress={submit} busy={request.isPending} />
      <TextLink href="/sign-in">Back to sign in</TextLink>
    </Screen>
  );
}
