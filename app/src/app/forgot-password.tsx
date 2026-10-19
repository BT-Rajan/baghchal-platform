import { useState } from 'react';
import { StyleSheet } from 'react-native';

import { Body, Button, Card, ErrorText, Field, Screen, Title } from '@/components/ui';
import { api } from '@/services';
import { space } from '@/theme';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.requestPasswordReset(email.trim());
      setSent(true);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Card style={styles.card}>
        <Title>Forgot password</Title>
        {sent ? (
          <Body>
            If {email.trim()} belongs to an account, we sent it a link to choose a new password. The
            link works for one hour.
          </Body>
        ) : (
          <>
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
            />
            <ErrorText error={error} />
            <Button
              label="Send reset link"
              onPress={submit}
              busy={busy}
              disabled={!email.includes('@')}
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
