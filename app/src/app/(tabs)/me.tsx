import { router } from 'expo-router';

import { useMe } from '@/auth/session';
import { Button } from '@/components/Button';
import { GuestBanner } from '@/components/GuestBanner';
import { ProfileView } from '@/components/ProfileView';
import { Screen } from '@/components/Screen';
import { ErrorState, Loading } from '@/components/States';
import { t } from '@/i18n';
import { useProfile } from '@/lobby/hooks';

/** My profile, as others see it, and the way to my settings. */
export default function MeScreen() {
  const me = useMe();
  const profile = useProfile(me.username);
  return (
    <Screen title={me.username} align="top" refreshable>
      <GuestBanner />
      <Button
        title={t('Settings')}
        icon="settings"
        variant="secondary"
        compact
        onPress={() => router.push('/settings')}
      />
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
