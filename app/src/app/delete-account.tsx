import { StyleSheet, Text } from 'react-native';

import { Card, Hint, SectionTitle } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { TextLink } from '@/components/TextLink';
import { colors, type } from '@/theme';

/**
 * How to delete a ClawPlay account, for anyone, signed in or not (app stores ask for such a
 * page). The deletion itself is the one in Settings; this page only says where it is.
 */
export default function DeleteAccount() {
  return (
    <Screen title="Delete your account" align="top">
      <Card>
        <Text style={styles.step}>1. Sign in to ClawPlay, in the app or on the website.</Text>
        <Text style={styles.step}>2. Open Me, then Settings.</Text>
        <Text style={styles.step}>3. Choose Delete account and confirm with your password.</Text>
      </Card>
      <Hint>
        Your email address, password and chat messages are deleted at once, and your username is
        replaced with an anonymous one. Guest accounts are deleted when you sign out.
      </Hint>
      <SectionTitle>Cannot sign in?</SectionTitle>
      <Hint>
        Write to us from the email address on your account, at the contact address in the privacy
        policy, and we will delete it for you.
      </Hint>
      <TextLink href="/privacy">Privacy policy: what we keep, and for how long</TextLink>
    </Screen>
  );
}

const styles = StyleSheet.create({
  step: { ...type.body, color: colors.text },
});
