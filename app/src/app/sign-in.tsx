import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { useSession } from '@/auth/session';
import { checkSignIn } from '@/auth/validation';
import { Button } from '@/components/Button';
import { useFormErrors } from '@/components/form';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { TextLink } from '@/components/TextLink';

const FIELDS = ['login', 'password'] as const;

export default function SignIn() {
  const { session } = useSession();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  // Signing in swaps this screen for the signed-in ones (see the route guards in _layout).
  const signIn = useMutation({ mutationFn: () => session.signIn(login, password) });
  const { fieldError, formMessage, accept } = useFormErrors(FIELDS, signIn.error);

  const submit = () => {
    signIn.reset();
    if (accept(checkSignIn({ login, password }))) signIn.mutate();
  };

  return (
    <Screen title="Sign in" brand>
      {formMessage !== null && <Notice tone="error">{formMessage}</Notice>}
      <TextField
        label="Username or email"
        value={login}
        onChangeText={setLogin}
        error={fieldError('login')}
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="username"
        textContentType="username"
        returnKeyType="next"
      />
      <TextField
        label="Password"
        value={password}
        onChangeText={setPassword}
        error={fieldError('password')}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      <Button title="Sign in" onPress={submit} busy={signIn.isPending} />
      <TextLink href="/forgot-password">Forgot your password?</TextLink>
      <TextLink href="/sign-up">New here? Create an account</TextLink>
    </Screen>
  );
}
