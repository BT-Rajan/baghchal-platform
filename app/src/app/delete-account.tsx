import { router } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import { useSession } from '@/auth/session';
import { Button } from '@/components/Button';
import { Card, Hint, SectionTitle } from '@/components/Card';
import { Screen } from '@/components/Screen';
import { TextLink } from '@/components/TextLink';
import { t } from '@/i18n';
import { colors, type } from '@/theme';

/**
 * How to delete a ClawPlay account, for anyone, signed in or not (app stores ask for such a
 * page). The deletion itself is the one in Settings; this page only says where it is.
 */
export default function DeleteAccount() {
  const { state } = useSession();
  const signedIn = state.status === 'signedIn';
  return (
    <Screen title={t('Delete your account')} align="top">
      <Card>
        <Text style={styles.step}>
          {t('1. Sign in to ClawPlay, in the app or on the website.')}
        </Text>
        <Text style={styles.step}>{t('2. Open Me, then Settings.')}</Text>
        <Text style={styles.step}>
          {t('3. Choose Account, then Delete account, and confirm with your password.')}
        </Text>
      </Card>
      {signedIn ? (
        <Button
          title={t('Open Settings')}
          variant="secondary"
          onPress={() => router.push('/settings')}
        />
      ) : (
        <Button title={t('Sign in')} variant="secondary" onPress={() => router.push('/sign-in')} />
      )}
      <Hint>
        {t(
          'Your email address, password and chat messages are deleted at once, and your username is replaced with an anonymous one. Guest accounts are deleted when you sign out.',
        )}
      </Hint>
      <SectionTitle>{t('Cannot sign in?')}</SectionTitle>
      <Hint>
        {t(
          'Write to us from the email address on your account, at the contact address in the privacy policy, and we will delete it for you.',
        )}
      </Hint>
      <TextLink href="/privacy">{t('Privacy policy: what we keep, and for how long')}</TextLink>
    </Screen>
  );
}

const styles = StyleSheet.create({
  step: { ...type.body, color: colors.text },
});
