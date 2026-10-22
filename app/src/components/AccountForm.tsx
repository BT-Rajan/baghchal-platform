import type { UseMutationResult } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Platform, type TextInputInstance } from 'react-native';

import type { Agreement } from '@/api/endpoints';
import { checkSignUp, PASSWORD_MIN } from '@/auth/validation';
import { plural, t } from '@/i18n';

import { AgreementLine, useAgreement } from './AgreementLine';
import { Button } from './Button';
import { Hint } from './Card';
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
 * account gives (`AgreementLine`): checked here, then sent with `action` (signing up, which
 * signs in at once, or a guest making their account) when its button is pressed. Its errors
 * show by the field they are about (the username's rules among them); what follows a success
 * is the caller's. One line of help: the password's length.
 */
export function AccountForm({
  action,
  submitTitle,
}: {
  action: UseMutationResult<unknown, Error, AccountDetails>;
  /** Pressing it accepts the agreement (the line above it says so). */
  submitTitle: string;
}) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const emailField = useRef<TextInputInstance>(null);
  const passwordField = useRef<TextInputInstance>(null);
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
        // A new account's name: Android's autofill offers to save it rather than fill one in.
        autoComplete={Platform.OS === 'android' ? 'username-new' : 'username'}
        textContentType="username"
        maxLength={20}
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => emailField.current?.focus()}
      />
      <TextField
        ref={emailField}
        label={t('Email')}
        value={email}
        onChangeText={setEmail}
        error={fieldError('email')}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="email"
        keyboardType="email-address"
        textContentType="emailAddress"
        returnKeyType="next"
        submitBehavior="submit"
        onSubmitEditing={() => passwordField.current?.focus()}
      />
      <TextField
        ref={passwordField}
        label={t('Password')}
        value={password}
        onChangeText={setPassword}
        error={fieldError('password')}
        secureTextEntry
        // A new password (Android's "password-new"): autofill offers a strong one to save.
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      {fieldError('password') === undefined && (
        <Hint>
          {plural(
            PASSWORD_MIN,
            'Use at least {count} character.',
            'Use at least {count} characters.',
          )}
        </Hint>
      )}
      <AgreementLine agreement={agreement} />
      <Button
        title={submitTitle}
        large
        onPress={submit}
        busy={action.isPending || agreement.versions.isPending}
      />
    </>
  );
}
