import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import type { TextInputInstance } from 'react-native';

import { useRememberedUsername, useSession } from '@/auth/session';
import { checkSignIn } from '@/auth/validation';
import { Button } from '@/components/Button';
import { useFormErrors } from '@/components/form';
import { GoogleButton } from '@/components/GoogleButton';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { TextLink } from '@/components/TextLink';
import { t } from '@/i18n';

const FIELDS = ['login', 'password'] as const;

/**
 * Sign in. On a device someone signed in on before, their username is filled in and the
 * password is the field to type in; "Not you?" forgets it and goes back to the start.
 */
export default function SignIn() {
  const { session } = useSession();
  const remembered = useRememberedUsername();
  const [login, setLogin] = useState(remembered ?? '');
  const [password, setPassword] = useState('');
  const passwordField = useRef<TextInputInstance>(null);
  // Signing in swaps this screen for the signed-in ones (see the route guards in _layout).
  const signIn = useMutation({ mutationFn: () => session.signIn(login, password) });
  const { fieldError, formMessage, accept } = useFormErrors(FIELDS, signIn.error);

  const submit = () => {
    signIn.reset();
    if (accept(checkSignIn({ login, password }))) signIn.mutate();
  };

  const notYou = () => {
    setLogin('');
    void session.forgetUsername();
  };

  return (
    <Screen title={t('Sign in')} brand>
      {formMessage !== null && <Notice tone="error">{formMessage}</Notice>}
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
      {remembered !== null && (
        <TextLink href="/welcome" onPress={notYou}>
          {t('Not you?')}
        </TextLink>
      )}
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
        autoFocus={remembered !== null}
        onSubmitEditing={submit}
      />
      <Button title={t('Sign in')} large onPress={submit} busy={signIn.isPending} />
      <TextLink href="/forgot-password">{t('Forgot password?')}</TextLink>
      <GoogleButton title={t('Sign in with Google')} />
      <TextLink href="/sign-up">{t('New here? Sign up')}</TextLink>
      <TextLink href="/start">{t('Play as a guest')}</TextLink>
    </Screen>
  );
}
