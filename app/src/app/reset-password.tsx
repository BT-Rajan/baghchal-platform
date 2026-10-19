import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { ApiError } from '@/api/errors';
import { useSession } from '@/auth/session';
import { LINK_TOKEN, MAX_PASSWORD, MIN_PASSWORD } from '@/auth/validation';
import { Body, Button, Card, ErrorText, Field, Screen, Title } from '@/components/ui';
import { api } from '@/services';
import { space } from '@/theme';

export default function ResetPassword() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { state } = useSession();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState(false);
  const valid = typeof token === 'string' && LINK_TOKEN.test(token);

  const submit = async () => {
    if (!valid || password.length < MIN_PASSWORD) return;
    setBusy(true);
    setError(null);
    try {
      await api.confirmPasswordReset(token, password);
      setDone(true);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Card style={styles.card}>
        <Title>Choose a new password</Title>
        {!valid ? (
          <Body>This link is incomplete. Open the link from the email again.</Body>
        ) : done ? (
          <>
            <Body>Your password has been changed and you have been signed out everywhere.</Body>
            <Button
              label={state.status === 'signed-in' ? 'Continue' : 'Sign in'}
              onPress={() => router.replace(state.status === 'signed-in' ? '/' : '/sign-in')}
            />
          </>
        ) : (
          <>
            <Field
              label="New password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              maxLength={MAX_PASSWORD}
              error={
                password && password.length < MIN_PASSWORD
                  ? 'At least 10 characters.'
                  : error instanceof ApiError
                    ? error.fieldProblem('password')
                    : undefined
              }
            />
            <ErrorText error={error} />
            <Button
              label="Change password"
              onPress={submit}
              busy={busy}
              disabled={password.length < MIN_PASSWORD}
            />
          </>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%', maxWidth: 420, alignSelf: 'center', gap: space.md },
});
