import { Stack, useLocalSearchParams } from 'expo-router';

import { isApiError } from '@/api/errors';
import { useMe } from '@/auth/session';
import { Notice } from '@/components/Notice';
import { ProfileView } from '@/components/ProfileView';
import { Screen } from '@/components/Screen';
import { ErrorState, Loading } from '@/components/States';
import { useProfile } from '@/lobby/hooks';

export default function Player() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const me = useMe();
  const profile = useProfile(username);
  return (
    <Screen align="top">
      <Stack.Screen options={{ title: profile.data?.username ?? username }} />
      {isApiError(profile.error, 'player_not_found') ? (
        <Notice tone="error">No such player.</Notice>
      ) : profile.error !== null ? (
        <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />
      ) : profile.data ? (
        <ProfileView profile={profile.data} isMe={profile.data.id === me.id} />
      ) : (
        <Loading label="Loading the profile" />
      )}
    </Screen>
  );
}
