import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import type { TextInputInstance } from 'react-native';

import { useSession } from '@/auth/session';
import { isApiError } from '@/api/errors';
import { checkSignIn, emailProblem } from '@/auth/validation';
import { Button } from '@/components/Button';
import { useFormErrors } from '@/components/form';
import { Notice } from '@/components/Notice';
import { ResendConfirmation } from '@/components/ResendConfirmation';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { TextLink } from '@/components/TextLink';
import { t } from '@/i18n';

const FIELDS = ['login', 'password'] as const;

export default function SignIn() {
  const { session } = useSession();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const passwordField = useRef<TextInputInstance>(null);
  // Signing in swaps this screen for the signed-in ones (see the route guards in _layout).
  const signIn = useMutation({ mutationFn: () => session.signIn(login, password) });
  const { fieldError, formMessage, accept } = useFormErrors(FIELDS, signIn.error);

  const submit = () => {
    signIn.reset();
    if (accept(checkSignIn({ login, password }))) signIn.mutate();
  };

  return (
    <Screen title={t('Sign in')} brand>
      {formMessage !== null && <Notice tone="error">{formMessage}</Notice>}
      {isApiError(signIn.error, 'email_not_verified') &&
        (emailProblem(login.trim()) === undefined ? (
          <ResendConfirmation email={login} />
        ) : (
          <Notice tone="info">
            {t(
              'Did the email not come? Sign in with your email address instead of your username, and we can send the link again.',
            )}
          </Notice>
        ))}
      <TextField
        label={t('Username or email')}
        value={login}
        onChangeText={setLogin}
        error={fieldError('login')}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        textContentType="username"
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
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Button title={t('Sign in')} onPress={submit} busy={signIn.isPending} />
      <TextLink href="/forgot-password">{t('Forgot your password?')}</TextLink>
      <TextLink href="/sign-up">{t('New here? Make a free account')}</TextLink>
      <TextLink href="/start">{t('Play now, no sign-up')}</TextLink>
    </Screen>
  );
}
