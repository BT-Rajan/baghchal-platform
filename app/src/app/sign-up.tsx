import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { useApi } from '@/auth/session';
import { checkSignUp } from '@/auth/validation';
import { Button } from '@/components/Button';
import { useFormErrors } from '@/components/form';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { TextLink } from '@/components/TextLink';

const FIELDS = ['username', 'email', 'password'] as const;
const CODE_FIELDS = {
  username_taken: 'username',
  username_unavailable: 'username',
  weak_password: 'password',
} as const;

export default function SignUp() {
  const api = useApi();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const register = useMutation({
    mutationFn: () => api.register({ username, email: email.trim(), password }),
  });
  const { fieldError, formMessage, accept } = useFormErrors(FIELDS, register.error, CODE_FIELDS);

  const submit = () => {
    register.reset();
    if (accept(checkSignUp({ username, email, password }))) register.mutate();
  };

  if (register.isSuccess) {
    return (
      <Screen title="Check your email" brand>
        <Notice tone="success">
          {`We sent a link to ${email.trim()}. Open it to finish creating your account.`}
        </Notice>
        <TextLink href="/sign-in">Back to sign in</TextLink>
      </Screen>
    );
  }

  return (
    <Screen title="Create an account" brand>
      {formMessage !== null && <Notice tone="error">{formMessage}</Notice>}
      <TextField
        label="Username"
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
        label="Email"
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
        label="Password"
        value={password}
        onChangeText={setPassword}
        error={fieldError('password')}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        onSubmitEditing={submit}
      />
      <Button title="Create account" onPress={submit} busy={register.isPending} />
      <TextLink href="/sign-in">Already have an account? Sign in</TextLink>
    </Screen>
  );
}
