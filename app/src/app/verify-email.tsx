import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { useSession } from '@/auth/session';
import { LINK_TOKEN } from '@/auth/validation';
import { Body, Button, Card, ErrorText, Loading, Screen, Title } from '@/components/ui';
import { space } from '@/theme';

/** One request per token, shared by every mount of this screen: tokens are single-use. */
const attempts = new Map<string, Promise<void>>();

export default function VerifyEmail() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { verifyEmail } = useSession();
  const [error, setError] = useState<unknown>(null);
  const [done, setDone] = useState(false);
  const valid = typeof token === 'string' && LINK_TOKEN.test(token);

  useEffect(() => {
    if (!valid) return;
    let attempt = attempts.get(token);
    if (!attempt) {
      attempt = verifyEmail(token);
      attempts.set(token, attempt);
    }
    let live = true;
    attempt.then(
      () => live && setDone(true),
      (e: unknown) => live && setError(e),
    );
    return () => {
      live = false;
    };
  }, [token, valid, verifyEmail]);

  return (
    <Screen>
      <Card style={styles.card}>
        <Title>Verify email</Title>
        {!valid ? (
          <Body>This link is incomplete. Open the link from the email again.</Body>
        ) : error ? (
          <>
            <ErrorText error={error} />
            <Button label="Back to sign in" onPress={() => router.replace('/sign-in')} />
          </>
        ) : done ? (
          <>
            <Body>Your email is verified and you are signed in.</Body>
            <Button label="Start playing" onPress={() => router.replace('/')} />
          </>
        ) : (
          <Loading />
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%', maxWidth: 420, alignSelf: 'center', gap: space.md },
});
