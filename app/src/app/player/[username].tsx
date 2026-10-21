import { router, Stack, useLocalSearchParams } from 'expo-router';

import { isApiError } from '@/api/errors';
import { useMe } from '@/auth/session';
import { Button } from '@/components/Button';
import { Notice } from '@/components/Notice';
import { ProfileView } from '@/components/ProfileView';
import { Screen } from '@/components/Screen';
import { ErrorState, Loading } from '@/components/States';
import { t } from '@/i18n';
import { useProfile } from '@/lobby/hooks';

export default function Player() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const me = useMe();
  const profile = useProfile(username);
  return (
    <Screen align="top" refreshable>
      <Stack.Screen options={{ title: profile.data?.username ?? username }} />
      {isApiError(profile.error, 'player_not_found') ? (
        <>
          <Notice tone="error">{t('No such player.')}</Notice>
          {/* The player search is on the home screen. */}
          <Button
            title={t('Find a player')}
            variant="secondary"
            onPress={() => router.navigate('/')}
          />
        </>
      ) : profile.error !== null ? (
        <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />
      ) : profile.data ? (
        <ProfileView profile={profile.data} isMe={profile.data.id === me.id} />
      ) : (
        <Loading label={t('Loading the profile')} />
      )}
    </Screen>
  );
}
