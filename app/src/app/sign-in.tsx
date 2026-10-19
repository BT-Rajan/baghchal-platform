import { Link } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useSession } from '@/auth/session';
import { Body, Button, Card, ErrorText, Field, Screen, Title } from '@/components/ui';
import { space, usePalette } from '@/theme';

export default function SignIn() {
  const { signIn } = useSession();
  const palette = usePalette();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const submit = async () => {
    if (!login.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(login.trim(), password);
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={styles.hero}>
        <Text style={styles.logo} accessible={false}>
          🐯 🐐
        </Text>
        <Title>Bagh Chal</Title>
        <Body muted>Tigers and goats, live against anyone.</Body>
      </View>
      <Card style={styles.card}>
        <Field
          label="Username or email"
          value={login}
          onChangeText={setLogin}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          textContentType="username"
          returnKeyType="next"
        />
        <Field
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          onSubmitEditing={submit}
          returnKeyType="go"
        />
        <ErrorText error={error} />
        <Button
          label="Sign in"
          onPress={submit}
          busy={busy}
          disabled={!login.trim() || !password}
        />
        <View style={styles.links}>
          <Link href="/sign-up" style={{ color: palette.accent }}>
            Create an account
          </Link>
          <Link href="/forgot-password" style={{ color: palette.accent }}>
            Forgot password?
          </Link>
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: space.sm, marginTop: space.xl },
  logo: { fontSize: 48 },
  card: { width: '100%', maxWidth: 420, alignSelf: 'center', gap: space.md },
  links: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: space.sm },
});
