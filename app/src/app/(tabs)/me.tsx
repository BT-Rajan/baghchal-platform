import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useMe } from '@/auth/session';
import { GuestBanner } from '@/components/GuestBanner';
import { IconButton } from '@/components/IconButton';
import { ProfileView } from '@/components/ProfileView';
import { Screen } from '@/components/Screen';
import { ErrorState, Loading } from '@/components/States';
import { t } from '@/i18n';
import { useProfile } from '@/lobby/hooks';
import { colors, joinedLetters, spacing, type } from '@/theme';

/** My profile, as others see it, with my name and the way to my settings at the top. */
export default function MeScreen() {
  const me = useMe();
  const profile = useProfile(me.username);
  return (
    <Screen align="top" refreshable>
      <View style={styles.titleRow}>
        <Text role="heading" style={[styles.title, joinedLetters()]} numberOfLines={1}>
          {me.username}
        </Text>
        <IconButton
          icon="settings"
          title={t('Settings')}
          onPress={() => router.push('/settings')}
        />
      </View>
      <GuestBanner />
      {profile.error !== null ? (
        <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />
      ) : profile.data ? (
        <ProfileView profile={profile.data} isMe />
      ) : (
        <Loading label={t('Loading your profile')} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  title: { ...type.title, color: colors.text, flex: 1 },
});
