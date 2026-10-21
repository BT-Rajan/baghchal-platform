import type { UseMutationResult } from '@tanstack/react-query';
import { useState } from 'react';

import { describeError } from '@/api/errors';
import { checkSignUp } from '@/auth/validation';
import { t } from '@/i18n';
import { AGREEMENT_CODE_FIELDS, AGREEMENT_FIELDS, type KnownAge } from '@/legal/agreement';

import { AgreementFields, useAgreement, type AgreementBody } from './AgreementFields';
import { Button } from './Button';
import { useFormErrors } from './form';
import { Notice } from './Notice';
import { TextField } from './TextField';

export type AccountDetails = AgreementBody & {
  username: string;
  email: string;
  password: string;
};

const FIELDS = ['username', 'email', 'password', ...AGREEMENT_FIELDS] as const;
const CODE_FIELDS = {
  username_taken: 'username',
  username_unavailable: 'username',
  weak_password: 'password',
  ...AGREEMENT_CODE_FIELDS,
} as const;

/**
 * The one form for a new account's username, email and password, with the age and agreement
 * every account gives (`AgreementFields`): checked here, then sent with `action` (signing up,
 * or a guest making their account). Its errors show by the field they are about; what follows
 * a success is the caller's.
 */
export function AccountForm({
  action,
  submitTitle,
  knownAge,
}: {
  action: UseMutationResult<unknown, Error, AccountDetails>;
  submitTitle: string;
  /** The age the server already has (a guest's): it is not asked again. */
  knownAge?: KnownAge;
}) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const agreement = useAgreement({ guest: false, ...(knownAge && { known: knownAge }) });
  const { fieldError, formMessage, accept } = useFormErrors(FIELDS, action.error, CODE_FIELDS);

  const submit = () => {
    action.reset();
    const { problems, body } = agreement.check(email);
    if (accept({ ...checkSignUp({ username, email, password }), ...problems }) && body) {
      action.mutate({ ...body, username, email: email.trim(), password });
    }
  };

  return (
    <>
      {formMessage !== null && <Notice tone="error">{formMessage}</Notice>}
      {agreement.versions.isError && (
        <Notice tone="error">{describeError(agreement.versions.error)}</Notice>
      )}
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
      <AgreementFields agreement={agreement} fieldError={fieldError} />
      <Button
        title={submitTitle}
        onPress={submit}
        busy={action.isPending || agreement.versions.isPending}
      />
    </>
  );
}
