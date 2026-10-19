import { Stack, useLocalSearchParams } from 'expo-router';

import { ApiError } from '@/api/errors';
import { useMe } from '@/auth/session';
import { ChallengeForm } from '@/components/lobby';
import { ProfileView } from '@/components/ProfileView';
import { Body, ErrorText, Heading, Loading, Screen } from '@/components/ui';
import { useProfile } from '@/hooks/queries';

export default function PlayerScreen() {
  const { username = '' } = useLocalSearchParams<{ username: string }>();
  const me = useMe();
  const profile = useProfile(username);
  const notFound = profile.error instanceof ApiError && profile.error.status === 404;
  const isMe = profile.data?.id === me.id;

  return (
    <Screen>
      <Stack.Screen options={{ title: profile.data?.username ?? username }} />
      {profile.isLoading ? <Loading /> : null}
      {notFound ? (
        <Body>There is no player called {username}.</Body>
      ) : (
        <ErrorText error={profile.error} />
      )}
      {profile.data ? (
        <>
          <ProfileView profile={profile.data} />
          {isMe ? null : profile.data.online ? (
            <>
              <Heading>Challenge</Heading>
              <ChallengeForm opponent={profile.data.username} />
            </>
          ) : (
            <Body muted>
              {profile.data.username} is offline. You can challenge players who are online.
            </Body>
          )}
        </>
      ) : null}
    </Screen>
  );
}
