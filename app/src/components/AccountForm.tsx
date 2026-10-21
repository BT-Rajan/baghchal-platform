import type { UseMutationResult } from '@tanstack/react-query';
import { useState } from 'react';

import type { Agreement } from '@/api/endpoints';
import { checkSignUp } from '@/auth/validation';
import { t } from '@/i18n';

import { AgreementLine, useAgreement } from './AgreementLine';
import { Button } from './Button';
import { useFormErrors } from './form';
import { Notice } from './Notice';
import { TextField } from './TextField';

export type AccountDetails = Agreement & {
  username: string;
  email: string;
  password: string;
};

const FIELDS = ['username', 'email', 'password'] as const;
const CODE_FIELDS = {
  username_taken: 'username',
  username_unavailable: 'username',
  weak_password: 'password',
} as const;

/**
 * The one form for a new account's username, email and password, with the agreement every
 * account gives (`AgreementLine`): checked here, then sent with `action` (signing up, or a guest
 * making their account) when its button, which says it accepts, is pressed. Its errors show by
 * the field they are about; what follows a success is the caller's.
 */
export function AccountForm({
  action,
  submitTitle,
}: {
  action: UseMutationResult<unknown, Error, AccountDetails>;
  /** "Accept and …": pressing it accepts the agreement. */
  submitTitle: string;
}) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const agreement = useAgreement();
  const { fieldError, formMessage, accept } = useFormErrors(FIELDS, action.error, CODE_FIELDS);

  const submit = () => {
    action.reset();
    const { body } = agreement;
    if (accept(checkSignUp({ username, email, password })) && body) {
      action.mutate({ ...body, username, email: email.trim(), password });
    }
  };

  return (
    <>
      {formMessage !== null && <Notice tone="error">{formMessage}</Notice>}
      <TextField
        label={t('Username')}
        value={username}
        onChangeText={setUsername}
        error={fieldError('username')}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        textContentType="username"
        maxLength={20}
      />
      <TextField
        label={t('Email')}
        value={email}
        onChangeText={setEmail}
        error={fieldError('email')}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
      />
      <TextField
        label={t('Password')}
        value={password}
        onChangeText={setPassword}
        error={fieldError('password')}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
      />
      <AgreementLine agreement={agreement} />
      <Button
        title={submitTitle}
        onPress={submit}
        busy={action.isPending || agreement.versions.isPending}
      />
    </>
  );
}
