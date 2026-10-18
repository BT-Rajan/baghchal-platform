import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { describeError } from '@/api/errors';
import { useMe, useSession } from '@/auth/session';
import { Button } from '@/components/Button';
import { Card, Hint, SectionTitle } from '@/components/Card';
import { Notice } from '@/components/Notice';
import { PlanCard } from '@/components/PlanCard';
import { ProfileView } from '@/components/ProfileView';
import { Screen } from '@/components/Screen';
import { ErrorState, Loading } from '@/components/States';
import { useBlock, useBlocks, useProfile } from '@/lobby/hooks';
import { colors, spacing } from '@/theme';

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
      <PlanCard />
      <BlockedPlayers />
      {me.role !== 'player' && (
        <Button title="Moderation" variant="secondary" onPress={() => router.push('/moderation')} />
      )}
      <Button
        title="Account settings"
        variant="secondary"
        onPress={() => router.push('/account')}
      />
      <Button
        title="Sign out"
        variant="secondary"
        onPress={() => signOut.mutate()}
        busy={signOut.isPending}
      />
    </Screen>
  );
}

function BlockedPlayers() {
  const blocks = useBlocks();
  const change = useBlock();
  return (
    <>
      <SectionTitle>Blocked players</SectionTitle>
      {change.error !== null && <Notice tone="error">{describeError(change.error)}</Notice>}
      {blocks.error !== null ? (
        <ErrorState error={blocks.error} onRetry={() => void blocks.refetch()} />
      ) : blocks.data === undefined ? (
        <Loading label="Loading blocked players" />
      ) : blocks.data.length === 0 ? (
        <Hint>You have not blocked anyone.</Hint>
      ) : (
        <Card>
          {blocks.data.map((player) => (
            <View key={player.id} style={styles.row}>
              <Text style={styles.name}>{player.username}</Text>
              <Button
                title={`Unblock ${player.username}`}
                label="Unblock"
                variant="secondary"
                compact
                busy={change.isPending && change.variables.username === player.username}
                onPress={() => change.mutate({ username: player.username, block: false })}
              />
            </View>
          ))}
        </Card>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { flex: 1, fontSize: 16, color: colors.text },
});
