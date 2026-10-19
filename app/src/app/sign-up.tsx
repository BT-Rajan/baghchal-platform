import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { ApiError } from '@/api/errors';
import { MAX_PASSWORD, MIN_PASSWORD, USERNAME } from '@/auth/validation';
import { Body, Button, Card, ErrorText, Field, Screen, Title } from '@/components/ui';
import { api } from '@/services';
import { space } from '@/theme';

export default function SignUp() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [sent, setSent] = useState(false);

  const usernameHint =
    username && !USERNAME.test(username)
      ? '3–20 letters, digits, _ or -, starting with a letter or digit.'
      : undefined;
  const passwordHint =
    password && password.length < MIN_PASSWORD ? 'At least 10 characters.' : undefined;
  const fieldError = (name: string) =>
    error instanceof ApiError ? error.fieldProblem(name) : undefined;
  const ready = USERNAME.test(username) && email.includes('@') && password.length >= MIN_PASSWORD;

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await api.register({ username, email: email.trim(), password });
      setSent(true);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <Screen>
        <Card style={styles.card}>
          <Title>Check your email</Title>
          <Body>
            We sent a link to {email.trim()}. Open it within 24 hours to finish creating your
            account.
          </Body>
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <Card style={styles.card}>
        <Title>Create account</Title>
        <Field
          label="Username"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username-new"
          maxLength={20}
          error={usernameHint ?? fieldError('username')}
        />
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          error={fieldError('email')}
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          maxLength={MAX_PASSWORD}
          error={passwordHint ?? fieldError('password')}
        />
        <ErrorText error={error instanceof ApiError && error.fields.length ? null : error} />
        <Button label="Create account" onPress={submit} busy={busy} disabled={!ready} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%', maxWidth: 420, alignSelf: 'center', gap: space.md },
});
