import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';

import { useApi, useSession } from '@/auth/session';
import { checkSignUp } from '@/auth/validation';
import { Button } from '@/components/Button';
import { Hint } from '@/components/Card';
import { useFormErrors } from '@/components/form';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';

const FIELDS = ['username', 'email', 'password'] as const;
const CODE_FIELDS = {
  username_taken: 'username',
  username_unavailable: 'username',
  weak_password: 'password',
} as const;

/** A guest makes a real account, keeping their games. */
export default function Claim() {
  const api = useApi();
  const { session } = useSession();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const claim = useMutation({
    mutationFn: async () => {
      await api.claimAccount({ username, email: email.trim(), password });
      await session.refresh();
    },
  });
  const { fieldError, formMessage, accept } = useFormErrors(FIELDS, claim.error, CODE_FIELDS);

  const submit = () => {
    claim.reset();
    if (accept(checkSignUp({ username, email, password }))) claim.mutate();
  };

  if (claim.isSuccess) {
    return (
      <Screen title={`Welcome, ${username}!`}>
        <Notice tone="success">
          {`Your account is ready and your games are kept. We sent a link to ${email.trim()}: open it to confirm your email address.`}
        </Notice>
        <Button title="Back to playing" onPress={() => router.navigate('/')} />
      </Screen>
    );
  }

  return (
    <Screen title="Make your free account">
      <Hint>
        Keep your games, play rated games and climb the leaderboard, challenge friends, and sign in
        on any device.
      </Hint>
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
      <Button title="Make my account" onPress={submit} busy={claim.isPending} />
    </Screen>
  );
}
