import { useMutation } from '@tanstack/react-query';
import { Text } from 'react-native';

import { useMe, useSession } from '@/auth/session';
import { Button } from '@/components/Button';
import { ProfileView } from '@/components/ProfileView';
import { Screen } from '@/components/Screen';
import { ErrorState, Loading } from '@/components/States';
import { useProfile } from '@/lobby/hooks';
import { colors } from '@/theme';

export default function MeScreen() {
  const me = useMe();
  const { session } = useSession();
  const profile = useProfile(me.username);
  const signOut = useMutation({ mutationFn: () => session.signOut() });
  return (
    <Screen title={me.username} align="top">
      <Text style={{ fontSize: 15, color: colors.muted }}>{me.email}</Text>
      {profile.error !== null ? (
        <ErrorState error={profile.error} onRetry={() => void profile.refetch()} />
      ) : profile.data ? (
        <ProfileView profile={profile.data} isMe />
      ) : (
        <Loading label="Loading your profile" />
      )}
      <Button
        title="Sign out"
        variant="secondary"
        onPress={() => signOut.mutate()}
        busy={signOut.isPending}
      />
    </Screen>
  );
}
